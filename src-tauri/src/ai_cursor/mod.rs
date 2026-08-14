use std::{
    path::{Path, PathBuf},
    time::Duration,
};

use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::{Child, Command},
    sync::mpsc,
};
use tokio_util::sync::CancellationToken;

use crate::ai_rig::{
    events::AiStatusEvent,
    helpers::{candidate_cli_paths, cli_runtime_path, emit_tool, executable_exists},
    providers::build_transcript,
    types::{AiAssistantMode, AiChunkEvent, AiMessage, AiModel, AiProfile, AiStoredToolEvent},
};

const RUN_TIMEOUT: Duration = Duration::from_secs(600);
const EXIT_AFTER_RESULT_GRACE: Duration = Duration::from_secs(2);
const STARTUP_OUTPUT_TIMEOUT: Duration = Duration::from_secs(30);
const LIST_MODELS_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_MODEL_ID: &str = "auto";

fn find_cursor_binary() -> Result<PathBuf, String> {
    for binary_name in ["agent", "cursor-agent"] {
        for path in candidate_cli_paths("CURSOR_CLI_PATH", binary_name) {
            if executable_exists(&path) {
                return Ok(path);
            }
        }
    }
    Err(
        "Cursor CLI not found. Install agent or set CURSOR_CLI_PATH to the native binary."
            .to_string(),
    )
}

fn model_entry(id: &str, name: &str) -> AiModel {
    AiModel {
        id: id.to_string(),
        name: name.to_string(),
        context_length: None,
        description: None,
        input_modalities: None,
        output_modalities: None,
        tokenizer: None,
        prompt_pricing: None,
        completion_pricing: None,
        supported_parameters: Some(vec!["tools".to_string()]),
        max_completion_tokens: None,
        reasoning_effort: None,
        default_reasoning_effort: None,
    }
}

fn parse_model_line(line: &str) -> Option<(String, String)> {
    let line = line.trim();
    let (id, name) = line.split_once(" - ")?;
    let id = id.trim();
    if id.is_empty() {
        return None;
    }
    Some((id.to_string(), name.trim().to_string()))
}

fn cursor_cli_failure(action: &str, status: impl std::fmt::Display, stderr: &str) -> String {
    let stderr = stderr.trim();
    if stderr.is_empty() {
        format!("Cursor CLI {action} exited with {status}")
    } else {
        format!("Cursor CLI {action} exited with {status}: {stderr}")
    }
}

pub async fn list_models(profile: &AiProfile) -> Result<Vec<AiModel>, String> {
    let binary = find_cursor_binary()?;
    let mut command = Command::new(&binary);
    command.arg("--list-models").kill_on_drop(true);
    if let Some(path) = cli_runtime_path(&binary) {
        command.env("PATH", path);
    }
    let output = tokio::time::timeout(LIST_MODELS_TIMEOUT, command.output())
        .await
        .map_err(|_| "Cursor CLI timed out while listing models".to_string())?
        .map_err(|e| format!("failed to list Cursor models: {e}"))?;
    if !output.status.success() {
        return Err(cursor_cli_failure(
            "listing models",
            output.status,
            &String::from_utf8_lossy(&output.stderr),
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut models = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for line in stdout.lines() {
        let Some((id, name)) = parse_model_line(line) else {
            continue;
        };
        if seen.insert(id.clone()) {
            models.push(model_entry(&id, &name));
        }
    }
    if seen.insert(DEFAULT_MODEL_ID.to_string()) {
        models.insert(0, model_entry(DEFAULT_MODEL_ID, "Auto"));
    }
    let selected = profile.model.trim();
    if !selected.is_empty() && seen.insert(selected.to_string()) {
        models.push(model_entry(selected, selected));
    }
    if models.is_empty() {
        models.push(model_entry(DEFAULT_MODEL_ID, "Auto"));
    }
    Ok(models)
}

fn prompt_text(system: &str, messages: &[AiMessage]) -> String {
    let transcript = build_transcript(system, messages);
    if transcript.trim().is_empty() {
        messages
            .iter()
            .rev()
            .find(|message| message.role == "user")
            .map(|message| message.content.clone())
            .unwrap_or_default()
    } else {
        transcript
    }
}

async fn pipe_stderr(child: &mut Child) -> mpsc::Receiver<String> {
    let (tx, rx) = mpsc::channel::<String>(64);
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = tx.send(line).await;
            }
        });
    }
    rx
}

async fn stop_child(child: &mut Child) {
    let _ = child.kill().await;
    let _ = child.wait().await;
}

struct KillChildOnDrop {
    child: Child,
}

impl KillChildOnDrop {
    fn new(child: Child) -> Self {
        Self { child }
    }
}

impl Drop for KillChildOnDrop {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

impl std::ops::Deref for KillChildOnDrop {
    type Target = Child;

    fn deref(&self) -> &Self::Target {
        &self.child
    }
}

impl std::ops::DerefMut for KillChildOnDrop {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.child
    }
}

async fn wait_after_result(child: &mut Child, last_stderr: &str) -> Result<(), String> {
    match tokio::time::timeout(EXIT_AFTER_RESULT_GRACE, child.wait()).await {
        Ok(Ok(status)) if status.success() => Ok(()),
        Ok(Ok(status)) => Err(if last_stderr.trim().is_empty() {
            format!("Cursor CLI exited with {status}")
        } else {
            format!("Cursor CLI exited with {status}: {last_stderr}")
        }),
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => {
            stop_child(child).await;
            Ok(())
        }
    }
}

fn emit_chunk(app: &AppHandle, job_id: &str, full: &mut String, delta: &str) {
    if delta.is_empty() {
        return;
    }
    full.push_str(delta);
    let _ = app.emit(
        "ai:chunk",
        AiChunkEvent {
            job_id: job_id.to_string(),
            delta: delta.to_string(),
        },
    );
}

fn emit_status(app: &AppHandle, job_id: &str, status: &str, detail: Option<String>) {
    let _ = app.emit(
        "ai:status",
        AiStatusEvent {
            job_id: job_id.to_string(),
            status: status.to_string(),
            detail,
        },
    );
}

fn assistant_text(value: &Value) -> String {
    value
        .pointer("/message/content")
        .and_then(|content| content.as_array())
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default()
}

fn tool_call_name(tool_call: &Value) -> &str {
    let Some(object) = tool_call.as_object() else {
        return "tool";
    };
    if let Some(name) = object
        .get("function")
        .and_then(|value| value.get("name"))
        .and_then(|value| value.as_str())
    {
        return name;
    }
    object
        .keys()
        .find(|key| key.ends_with("ToolCall"))
        .map(|key| key.strip_suffix("ToolCall").unwrap_or(key.as_str()))
        .unwrap_or("tool")
}

fn handle_tool_call(
    app: &AppHandle,
    job_id: &str,
    value: &Value,
    tool_events: &mut Vec<AiStoredToolEvent>,
) {
    let Some(subtype) = value.get("subtype").and_then(|v| v.as_str()) else {
        return;
    };
    let tool_call = value.get("tool_call").unwrap_or(&Value::Null);
    let phase = match subtype {
        "started" => "call",
        "completed" => {
            if tool_call.pointer("/result/error").is_some() {
                "error"
            } else {
                "result"
            }
        }
        _ => return,
    };
    let error = tool_call
        .pointer("/result/error")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    emit_tool(
        app,
        job_id,
        tool_events,
        tool_call_name(tool_call),
        phase,
        value
            .get("call_id")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        Some(tool_call.clone()),
        error,
    );
}

fn handle_event(
    app: &AppHandle,
    job_id: &str,
    value: &Value,
    full: &mut String,
    tool_events: &mut Vec<AiStoredToolEvent>,
) -> Result<Option<bool>, String> {
    match value.get("type").and_then(|v| v.as_str()) {
        Some("system") => {
            if value.get("subtype").and_then(|v| v.as_str()) == Some("init") {
                let model = value
                    .get("model")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Cursor");
                emit_status(
                    app,
                    job_id,
                    "thinking",
                    Some(format!("Cursor is running ({model})")),
                );
            }
            Ok(None)
        }
        Some("assistant") => {
            let has_timestamp = value.get("timestamp_ms").is_some();
            let has_model_call = value.get("model_call_id").is_some();
            let is_stream_delta = has_timestamp && !has_model_call;
            let is_complete_message = !has_timestamp && !has_model_call && full.is_empty();
            if is_stream_delta || is_complete_message {
                emit_chunk(app, job_id, full, &assistant_text(value));
            }
            Ok(None)
        }
        Some("tool_call") => {
            handle_tool_call(app, job_id, value, tool_events);
            Ok(None)
        }
        Some("result") => {
            if value
                .get("is_error")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                return Err(value
                    .get("result")
                    .or_else(|| value.get("error"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Cursor CLI request failed")
                    .to_string());
            }
            if full.trim().is_empty() {
                if let Some(result) = value.get("result").and_then(|v| v.as_str()) {
                    emit_chunk(app, job_id, full, result);
                }
            }
            Ok(Some(false))
        }
        _ => Ok(None),
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn run_with_cursor(
    cancel: &CancellationToken,
    app: &AppHandle,
    job_id: &str,
    profile: &AiProfile,
    system: &str,
    messages: &[AiMessage],
    mode: &AiAssistantMode,
    space_root: Option<&Path>,
) -> Result<(String, bool, Vec<AiStoredToolEvent>), String> {
    let root = space_root.ok_or_else(|| "No space is open".to_string())?;
    let binary = find_cursor_binary()?;
    let prompt = prompt_text(system, messages);
    if prompt.trim().is_empty() {
        return Err("Cursor CLI needs a prompt".to_string());
    }

    emit_status(
        app,
        job_id,
        "thinking",
        Some("Starting Cursor CLI".to_string()),
    );

    let mut command = Command::new(&binary);
    command
        .arg("-p")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--stream-partial-output")
        .arg("--trust")
        .arg("--approve-mcps")
        .arg("--workspace")
        .arg(root)
        .current_dir(root)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    if let Some(path) = cli_runtime_path(&binary) {
        command.env("PATH", path);
    }

    match mode {
        AiAssistantMode::Chat => {
            command.arg("--mode").arg("ask");
        }
        AiAssistantMode::Create => {
            command.arg("--force").arg("--sandbox").arg("disabled");
        }
    }

    let model = profile.model.trim();
    if !model.is_empty() && model != DEFAULT_MODEL_ID {
        command.arg("--model").arg(model);
    }
    command.arg(prompt).kill_on_drop(true);

    let mut child = KillChildOnDrop::new(
        command
            .spawn()
            .map_err(|e| format!("failed to start Cursor CLI: {e}"))?,
    );
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture Cursor CLI stdout".to_string())?;
    let mut stdout_lines = BufReader::new(stdout).lines();
    let mut stderr_lines = pipe_stderr(&mut child).await;

    let timeout = tokio::time::sleep(RUN_TIMEOUT);
    tokio::pin!(timeout);
    let startup_timeout = tokio::time::sleep(STARTUP_OUTPUT_TIMEOUT);
    tokio::pin!(startup_timeout);
    let mut full = String::new();
    let mut tool_events = Vec::new();
    let mut last_stderr = String::new();
    let mut saw_stdout = false;
    let mut stderr_open = true;

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                stop_child(&mut child).await;
                return Ok((String::new(), true, tool_events));
            }
            _ = &mut timeout => {
                stop_child(&mut child).await;
                return Err("Cursor CLI request timed out".to_string());
            }
            _ = &mut startup_timeout, if !saw_stdout => {
                stop_child(&mut child).await;
                return Err(if last_stderr.trim().is_empty() {
                    "Cursor CLI produced no output after starting".to_string()
                } else {
                    format!("Cursor CLI produced no output after starting: {last_stderr}")
                });
            }
            maybe_err = stderr_lines.recv(), if stderr_open => {
                match maybe_err {
                    Some(line) => {
                        if !line.trim().is_empty() {
                            last_stderr = line;
                        }
                    }
                    None => stderr_open = false,
                }
            }
            line = stdout_lines.next_line() => {
                let line = match line {
                    Ok(line) => line,
                    Err(e) => {
                        stop_child(&mut child).await;
                        return Err(format!("failed reading Cursor CLI output: {e}"));
                    }
                };
                let Some(line) = line else {
                    let status = child.wait().await.map_err(|e| e.to_string())?;
                    if status.success() && !full.trim().is_empty() {
                        return Ok((full, false, tool_events));
                    }
                    return Err(cursor_cli_failure("request", status, &last_stderr));
                };
                if line.trim().is_empty() {
                    continue;
                }
                saw_stdout = true;
                let value = match serde_json::from_str::<Value>(&line) {
                    Ok(value) => value,
                    Err(e) => {
                        stop_child(&mut child).await;
                        return Err(format!("failed to parse Cursor CLI JSON output: {e}"));
                    }
                };
                match handle_event(app, job_id, &value, &mut full, &mut tool_events) {
                    Ok(Some(done)) => {
                        wait_after_result(&mut child, &last_stderr).await?;
                        return Ok((full, done, tool_events));
                    }
                    Ok(None) => {}
                    Err(e) => {
                        stop_child(&mut child).await;
                        return Err(e);
                    }
                }
            }
        }
    }
}
