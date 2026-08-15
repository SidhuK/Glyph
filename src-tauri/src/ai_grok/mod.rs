use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    process::Command as StdCommand,
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
    helpers::{cli_runtime_path, emit_tool, find_cli_binary},
    providers::build_transcript,
    types::{
        AiAssistantMode, AiChunkEvent, AiMessage, AiModel, AiProfile, AiReasoningEffortOption,
        AiStoredToolEvent,
    },
};

const RUN_TIMEOUT: Duration = Duration::from_secs(600);
const EXIT_AFTER_RESULT_GRACE: Duration = Duration::from_secs(2);
const STARTUP_OUTPUT_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_MODEL_ID: &str = "grok-build";
const CHAT_TOOLS: &str = "read_file,grep,list_dir";
const GROK_ALIAS_MODELS: &[(&str, &str, &str)] = &[
    (
        DEFAULT_MODEL_ID,
        "Grok Build",
        "Default Grok coding agent for the signed-in xAI account.",
    ),
    (
        "grok-4.6",
        "Grok 4.6",
        "Latest general Grok model advertised by the Grok CLI.",
    ),
    (
        "grok-4.5",
        "Grok 4.5",
        "Previous general Grok model advertised by the Grok CLI.",
    ),
    (
        "grok-code-fast-1",
        "Grok Code Fast",
        "Faster coding alias for Grok Build.",
    ),
];

fn find_grok_binary() -> Result<PathBuf, String> {
    find_cli_binary("Grok", "GROK_CLI_PATH", "grok")
}

fn reasoning_options() -> Vec<AiReasoningEffortOption> {
    ["none", "minimal", "low", "medium", "high", "xhigh", "max"]
        .into_iter()
        .map(|effort| AiReasoningEffortOption {
            effort: effort.to_string(),
            description: None,
        })
        .collect()
}

fn model_entry(id: &str, name: &str, description: &str) -> AiModel {
    AiModel {
        id: id.to_string(),
        name: name.to_string(),
        context_length: None,
        description: Some(description.to_string()),
        input_modalities: None,
        output_modalities: None,
        tokenizer: None,
        prompt_pricing: None,
        completion_pricing: None,
        supported_parameters: Some(vec!["tools".to_string(), "reasoning".to_string()]),
        max_completion_tokens: None,
        reasoning_effort: Some(reasoning_options()),
        default_reasoning_effort: None,
    }
}

fn grok_model_name(id: &str) -> String {
    id.split('-')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn model_entry_for_id(id: &str) -> AiModel {
    if let Some((_, name, description)) =
        GROK_ALIAS_MODELS.iter().find(|(alias, _, _)| *alias == id)
    {
        return model_entry(id, name, description);
    }
    model_entry(
        id,
        &grok_model_name(id),
        "Grok model discovered from the installed Grok CLI.",
    )
}

fn push_model_id(models: &mut Vec<String>, seen: &mut HashSet<String>, id: &str) {
    let trimmed = id.trim();
    if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
        return;
    }
    models.push(trimmed.to_string());
}

fn is_grok_model_id(id: &str) -> bool {
    let id = id.trim();
    id.len() >= 6
        && id.starts_with("grok-")
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.' || c == '_')
}

fn collect_models_from_text(text: &str, models: &mut Vec<String>, seen: &mut HashSet<String>) {
    for token in
        text.split(|c: char| !(c.is_ascii_alphanumeric() || c == '-' || c == '.' || c == '_'))
    {
        if is_grok_model_id(token) {
            push_model_id(models, seen, token);
        }
    }
}

fn grok_config_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        if let Some(grok_home) = std::env::var_os("GROK_HOME").map(PathBuf::from) {
            paths.push(grok_home.join("config.toml"));
        }
        paths.push(home.join(".grok/config.toml"));
    }
    paths
}

fn collect_models_from_config(models: &mut Vec<String>, seen: &mut HashSet<String>) {
    for path in grok_config_paths() {
        let Ok(text) = std::fs::read_to_string(path) else {
            continue;
        };
        for line in text.lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("[model.") {
                let id = rest.trim_end_matches(']').trim_matches('"').trim();
                if is_grok_model_id(id) || !id.is_empty() {
                    push_model_id(models, seen, id);
                }
                continue;
            }
            if line.starts_with('#') || !line.contains("default") {
                continue;
            }
            collect_models_from_text(line, models, seen);
        }
    }
}

fn collect_models_from_runtime(
    binary: &Path,
    models: &mut Vec<String>,
    seen: &mut HashSet<String>,
) {
    if let Ok(output) = StdCommand::new(binary).arg("--help").output() {
        collect_models_from_text(&String::from_utf8_lossy(&output.stdout), models, seen);
        collect_models_from_text(&String::from_utf8_lossy(&output.stderr), models, seen);
    }
}

pub fn list_models(profile: &AiProfile) -> Result<Vec<AiModel>, String> {
    let binary = find_grok_binary()?;
    let mut seen = HashSet::new();
    let mut ids = Vec::new();

    for (id, _, _) in GROK_ALIAS_MODELS {
        push_model_id(&mut ids, &mut seen, id);
    }
    collect_models_from_runtime(&binary, &mut ids, &mut seen);
    collect_models_from_config(&mut ids, &mut seen);
    push_model_id(&mut ids, &mut seen, &profile.model);

    Ok(ids.into_iter().map(|id| model_entry_for_id(&id)).collect())
}

fn prompt_text(messages: &[AiMessage]) -> String {
    let transcript = build_transcript("", messages);
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
        Ok(Ok(status)) => Err(grok_cli_failure("request", status, last_stderr)),
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => {
            stop_child(child).await;
            Ok(())
        }
    }
}

fn grok_cli_failure(action: &str, status: impl std::fmt::Display, stderr: &str) -> String {
    let stderr = stderr.trim();
    if stderr.is_empty() {
        format!("Grok CLI {action} exited with {status}")
    } else {
        format!("Grok CLI {action} exited with {status}: {stderr}")
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

fn event_text(value: &Value) -> Option<&str> {
    value
        .get("data")
        .and_then(|v| v.as_str())
        .or_else(|| value.get("text").and_then(|v| v.as_str()))
        .or_else(|| value.get("message").and_then(|v| v.as_str()))
}

fn tool_name(value: &Value) -> &str {
    value
        .get("toolName")
        .or_else(|| value.get("tool_name"))
        .or_else(|| value.get("title"))
        .or_else(|| value.get("kind"))
        .and_then(|v| v.as_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("tool")
}

fn tool_call_id(value: &Value) -> Option<String> {
    value
        .get("toolCallId")
        .or_else(|| value.get("tool_call_id"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

fn tool_error(value: &Value) -> Option<String> {
    value
        .get("error")
        .and_then(|v| v.as_str())
        .or_else(|| {
            value
                .get("rawOutput")
                .and_then(|output| output.get("error").or_else(|| output.get("message")))
                .and_then(|v| v.as_str())
        })
        .filter(|message| !message.is_empty())
        .map(str::to_string)
}

fn handle_tool_call(
    app: &AppHandle,
    job_id: &str,
    value: &Value,
    tool_events: &mut Vec<AiStoredToolEvent>,
    phase: &str,
) {
    emit_tool(
        app,
        job_id,
        tool_events,
        tool_name(value),
        phase,
        tool_call_id(value),
        Some(value.clone()),
        if phase == "error" {
            tool_error(value)
        } else {
            None
        },
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
        Some("text") => {
            emit_chunk(app, job_id, full, event_text(value).unwrap_or(""));
            Ok(None)
        }
        Some("thought") => {
            if let Some(thought) = event_text(value).map(str::trim).filter(|s| !s.is_empty()) {
                emit_status(app, job_id, "thinking", Some(thought.to_string()));
            }
            Ok(None)
        }
        Some("tool_call") => {
            handle_tool_call(app, job_id, value, tool_events, "call");
            Ok(None)
        }
        Some("tool_call_update") => {
            let status = value.get("status").and_then(|v| v.as_str()).unwrap_or("");
            let phase = match status {
                "failed" | "error" | "cancelled" => "error",
                "in_progress" | "pending" => return Ok(None),
                _ => "result",
            };
            handle_tool_call(app, job_id, value, tool_events, phase);
            Ok(None)
        }
        Some("end") => {
            if full.trim().is_empty() {
                if let Some(text) = event_text(value) {
                    emit_chunk(app, job_id, full, text);
                }
            }
            Ok(Some(false))
        }
        Some("error") => Err(event_text(value)
            .unwrap_or("Grok CLI request failed")
            .to_string()),
        _ => Ok(None),
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn run_with_grok(
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
    let binary = find_grok_binary()?;
    let prompt = prompt_text(messages);
    if prompt.trim().is_empty() {
        return Err("Grok CLI needs a prompt".to_string());
    }

    emit_status(
        app,
        job_id,
        "thinking",
        Some("Starting Grok CLI".to_string()),
    );

    let mut command = Command::new(&binary);
    command
        .arg("--no-auto-update")
        .arg("--no-alt-screen")
        .arg("-p")
        .arg(&prompt)
        .arg("--cwd")
        .arg(root)
        .arg("--output-format")
        .arg("streaming-json")
        .arg("--verbatim")
        .current_dir(root)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    if let Some(path) = cli_runtime_path(&binary) {
        command.env("PATH", path);
    }

    match mode {
        AiAssistantMode::Chat => {
            command.arg("--tools").arg(CHAT_TOOLS);
        }
        AiAssistantMode::Create => {
            command.arg("--yolo");
        }
    }

    if !system.trim().is_empty() {
        command.arg("--rules").arg(system.trim());
    }
    let model = profile.model.trim();
    if !model.is_empty() && model != DEFAULT_MODEL_ID {
        command.arg("-m").arg(model);
    }
    if let Some(effort) = profile
        .reasoning_effort
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        command.arg("--effort").arg(effort);
    }
    command.kill_on_drop(true);

    let mut child = KillChildOnDrop::new(
        command
            .spawn()
            .map_err(|e| format!("failed to start Grok CLI: {e}"))?,
    );
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture Grok CLI stdout".to_string())?;
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
    let mut stdout_open = true;

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                stop_child(&mut child).await;
                return Ok((String::new(), true, tool_events));
            }
            _ = &mut timeout => {
                stop_child(&mut child).await;
                return Err("Grok CLI request timed out".to_string());
            }
            _ = &mut startup_timeout, if !saw_stdout => {
                stop_child(&mut child).await;
                return Err(if last_stderr.trim().is_empty() {
                    "Grok CLI produced no output after starting".to_string()
                } else {
                    format!("Grok CLI produced no output after starting: {last_stderr}")
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
            status = child.wait(), if !stdout_open => {
                let status = status.map_err(|e| e.to_string())?;
                if status.success() && !full.trim().is_empty() {
                    return Ok((full, false, tool_events));
                }
                return Err(grok_cli_failure("request", status, &last_stderr));
            }
            line = stdout_lines.next_line(), if stdout_open => {
                let line = match line {
                    Ok(line) => line,
                    Err(e) => {
                        stop_child(&mut child).await;
                        return Err(format!("failed reading Grok CLI output: {e}"));
                    }
                };
                let Some(line) = line else {
                    stdout_open = false;
                    continue;
                };
                if line.trim().is_empty() {
                    continue;
                }
                saw_stdout = true;
                let value = match serde_json::from_str::<Value>(&line) {
                    Ok(value) => value,
                    Err(e) => {
                        stop_child(&mut child).await;
                        return Err(format!("failed to parse Grok CLI JSON output: {e}"));
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
