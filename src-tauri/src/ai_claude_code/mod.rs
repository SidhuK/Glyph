use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    process::Command as StdCommand,
    time::Duration,
};

use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::mpsc,
};
use tokio_util::sync::CancellationToken;

use crate::ai_rig::{
    events::AiStatusEvent,
    helpers::{emit_tool, find_cli_binary},
    providers::build_transcript,
    types::{AiAssistantMode, AiChunkEvent, AiMessage, AiModel, AiProfile, AiStoredToolEvent},
};

const RUN_TIMEOUT: Duration = Duration::from_secs(600);
const EXIT_AFTER_RESULT_GRACE: Duration = Duration::from_secs(2);
const STARTUP_OUTPUT_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_MODEL_ID: &str = "default";
const CLAUDE_CODE_ALIAS_MODELS: &[(&str, &str, &str)] = &[
    (
        DEFAULT_MODEL_ID,
        "Default",
        "Claude Code runtime default for the signed-in account.",
    ),
    ("sonnet", "Sonnet", "Claude Code latest Sonnet alias."),
    (
        "sonnet[1m]",
        "Sonnet (1M context)",
        "Claude Code latest Sonnet alias with a 1 million token context window.",
    ),
    ("opus", "Opus", "Claude Code latest Opus alias."),
    (
        "opusplan",
        "Opus Plan",
        "Claude Code uses Opus for planning and Sonnet for execution.",
    ),
    ("haiku", "Haiku", "Claude Code latest Haiku alias."),
];

fn find_claude_binary() -> Result<PathBuf, String> {
    find_cli_binary("Claude Code", "CLAUDE_CODE_CLI_PATH", "claude")
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
        supported_parameters: Some(vec!["tools".to_string()]),
        max_completion_tokens: None,
        reasoning_effort: None,
        default_reasoning_effort: None,
    }
}

fn read_json_file(path: &Path) -> Option<Value> {
    let bytes = std::fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn push_model_id(models: &mut Vec<String>, seen: &mut HashSet<String>, id: &str) {
    let trimmed = id.trim();
    if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
        return;
    }
    models.push(trimmed.to_string());
}

fn collect_models_from_settings(
    value: &Value,
    models: &mut Vec<String>,
    seen: &mut HashSet<String>,
) {
    if let Some(model) = value.get("model").and_then(|v| v.as_str()) {
        push_model_id(models, seen, model);
    }
    if let Some(items) = value.get("availableModels").and_then(|v| v.as_array()) {
        for item in items {
            collect_model_from_value(models, seen, item);
        }
    }
    if let Some(items) = value.get("allowModels").and_then(|v| v.as_array()) {
        for item in items {
            collect_model_from_value(models, seen, item);
        }
    }
}

fn collect_model_from_value(models: &mut Vec<String>, seen: &mut HashSet<String>, value: &Value) {
    if let Some(model) = value.as_str() {
        push_model_id(models, seen, model);
        return;
    }
    for key in ["id", "model", "name"] {
        if let Some(model) = value.get(key).and_then(|v| v.as_str()) {
            push_model_id(models, seen, model);
            return;
        }
    }
}

fn is_runtime_model_id(id: &str) -> bool {
    let id = id.strip_suffix("[1m]").unwrap_or(id);
    let Some(rest) = id.strip_prefix("claude-") else {
        return false;
    };
    if let Some(version) = rest
        .strip_prefix("opus-")
        .or_else(|| rest.strip_prefix("sonnet-"))
        .or_else(|| rest.strip_prefix("haiku-"))
    {
        let mut parts = version.split('-');
        return parts.next().is_some_and(|part| {
            !part.is_empty() && part.len() <= 2 && part.chars().all(|c| c.is_ascii_digit())
        }) && parts.all(|part| {
            !part.is_empty() && part.len() <= 2 && part.chars().all(|c| c.is_ascii_digit())
        });
    }
    matches!(
        rest,
        "3-opus" | "3-sonnet" | "3-haiku" | "3-5-sonnet" | "3-5-haiku" | "3-7-sonnet"
    )
}

fn collect_models_from_runtime_text(
    text: &str,
    models: &mut Vec<String>,
    seen: &mut HashSet<String>,
) {
    for token in
        text.split(|c: char| !(c.is_ascii_alphanumeric() || c == '-' || c == '[' || c == ']'))
    {
        if is_runtime_model_id(token) {
            push_model_id(models, seen, token);
        }
    }
}

fn collect_models_from_runtime(
    binary: &Path,
    models: &mut Vec<String>,
    seen: &mut HashSet<String>,
) {
    if let Ok(output) = StdCommand::new(binary).arg("--help").output() {
        collect_models_from_runtime_text(&String::from_utf8_lossy(&output.stdout), models, seen);
        collect_models_from_runtime_text(&String::from_utf8_lossy(&output.stderr), models, seen);
    }
    if let Ok(bytes) = std::fs::read(binary) {
        collect_models_from_runtime_text(&String::from_utf8_lossy(&bytes), models, seen);
    }
}

fn claude_settings_paths(root: &Path) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        paths.push(home.join(".claude/settings.json"));
    }
    paths.push(root.join(".claude/settings.json"));
    paths.push(root.join(".claude/settings.local.json"));
    paths
}

fn claude_model_name(id: &str) -> String {
    let Some(rest) = id.strip_prefix("claude-") else {
        return id.to_string();
    };
    let parts = rest.split('-').collect::<Vec<_>>();
    if parts.len() < 2 {
        return id.to_string();
    }
    if parts[0].chars().all(|c| c.is_ascii_digit()) {
        let family = parts.last().copied().unwrap_or_default();
        let version = parts[..parts.len().saturating_sub(1)].join(".");
        return format!("Claude {version} {}", title_word(family));
    }
    format!("Claude {} {}", title_word(parts[0]), parts[1..].join("."))
}

fn title_word(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
        None => String::new(),
    }
}

fn model_entry_for_id(id: &str) -> AiModel {
    if let Some((_, name, description)) = CLAUDE_CODE_ALIAS_MODELS
        .iter()
        .find(|(alias, _, _)| *alias == id)
    {
        return model_entry(id, name, description);
    }
    model_entry(
        id,
        &claude_model_name(id),
        "Claude Code model discovered from the installed Claude Code runtime.",
    )
}

pub fn list_models(root: &Path, profile: &AiProfile) -> Result<Vec<AiModel>, String> {
    let binary = find_claude_binary()?;
    let mut seen = HashSet::new();
    let mut ids = Vec::new();

    for (id, _, _) in CLAUDE_CODE_ALIAS_MODELS {
        push_model_id(&mut ids, &mut seen, id);
    }
    collect_models_from_runtime(&binary, &mut ids, &mut seen);
    for path in claude_settings_paths(root) {
        if let Some(value) = read_json_file(&path) {
            collect_models_from_settings(&value, &mut ids, &mut seen);
        }
    }
    push_model_id(&mut ids, &mut seen, &profile.model);

    let models = ids.into_iter().map(|id| model_entry_for_id(&id)).collect();

    Ok(models)
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

async fn close_stdin(mut stdin: ChildStdin, prompt: String) -> Result<(), String> {
    let mut prompt_bytes = prompt.into_bytes();
    if !prompt_bytes.ends_with(b"\n") {
        prompt_bytes.push(b'\n');
    }
    stdin
        .write_all(&prompt_bytes)
        .await
        .map_err(|e| format!("failed writing Claude Code prompt: {e}"))?;
    stdin
        .shutdown()
        .await
        .map_err(|e| format!("failed closing Claude Code stdin: {e}"))?;
    drop(stdin);
    Ok(())
}

async fn wait_after_result(child: &mut Child, last_stderr: &str) -> Result<(), String> {
    match tokio::time::timeout(EXIT_AFTER_RESULT_GRACE, child.wait()).await {
        Ok(Ok(status)) if status.success() => Ok(()),
        Ok(Ok(status)) => Err(if last_stderr.trim().is_empty() {
            format!("Claude Code exited with {status}")
        } else {
            format!("Claude Code exited with {status}: {last_stderr}")
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

fn tool_name(value: &Value) -> &str {
    value
        .get("name")
        .or_else(|| value.get("tool"))
        .and_then(|v| v.as_str())
        .unwrap_or("tool")
}

fn tool_id(value: &Value) -> Option<String> {
    value
        .get("id")
        .or_else(|| value.get("tool_use_id"))
        .or_else(|| value.get("call_id"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

fn emit_tool_once(
    app: &AppHandle,
    job_id: &str,
    tool_events: &mut Vec<AiStoredToolEvent>,
    tool: &str,
    phase: &str,
    call_id: Option<String>,
    payload: Option<Value>,
    error: Option<String>,
) {
    if call_id.as_deref().is_some_and(|id| {
        tool_events.iter().any(|event| {
            event.call_id.as_deref() == Some(id) && event.tool == tool && event.phase == phase
        })
    }) {
        return;
    }
    emit_tool(
        app,
        job_id,
        tool_events,
        tool,
        phase,
        call_id,
        payload,
        error,
    );
}

fn handle_stream_event(
    app: &AppHandle,
    job_id: &str,
    value: &Value,
    full: &mut String,
    tool_events: &mut Vec<AiStoredToolEvent>,
) {
    let event = value.get("event").unwrap_or(&Value::Null);
    match event.get("type").and_then(|v| v.as_str()) {
        Some("content_block_delta") => {
            let delta = event.get("delta").unwrap_or(&Value::Null);
            if delta.get("type").and_then(|v| v.as_str()) == Some("text_delta") {
                if let Some(text) = delta.get("text").and_then(|v| v.as_str()) {
                    emit_chunk(app, job_id, full, text);
                }
            }
        }
        Some("content_block_start") => {
            let block = event.get("content_block").unwrap_or(&Value::Null);
            if block.get("type").and_then(|v| v.as_str()) == Some("tool_use") {
                emit_tool_once(
                    app,
                    job_id,
                    tool_events,
                    tool_name(block),
                    "call",
                    tool_id(block),
                    Some(block.clone()),
                    None,
                );
            }
        }
        _ => {}
    }
}

fn handle_assistant_message(
    app: &AppHandle,
    job_id: &str,
    value: &Value,
    full: &mut String,
    tool_events: &mut Vec<AiStoredToolEvent>,
) {
    let Some(content) = value.pointer("/message/content").and_then(|v| v.as_array()) else {
        return;
    };
    for part in content {
        match part.get("type").and_then(|v| v.as_str()) {
            Some("text") if full.trim().is_empty() => {
                if let Some(text) = part.get("text").and_then(|v| v.as_str()) {
                    emit_chunk(app, job_id, full, text);
                }
            }
            Some("tool_use") => {
                emit_tool_once(
                    app,
                    job_id,
                    tool_events,
                    tool_name(part),
                    "call",
                    tool_id(part),
                    Some(part.clone()),
                    None,
                );
            }
            _ => {}
        }
    }
}

fn handle_user_message(
    app: &AppHandle,
    job_id: &str,
    value: &Value,
    tool_events: &mut Vec<AiStoredToolEvent>,
) {
    let Some(content) = value.pointer("/message/content").and_then(|v| v.as_array()) else {
        return;
    };
    for part in content {
        if part.get("type").and_then(|v| v.as_str()) != Some("tool_result") {
            continue;
        }
        let is_error = part
            .get("is_error")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let error = is_error
            .then(|| part.get("content").and_then(|v| v.as_str()).unwrap_or(""))
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        emit_tool_once(
            app,
            job_id,
            tool_events,
            "tool",
            if is_error { "error" } else { "result" },
            tool_id(part),
            Some(part.clone()),
            error,
        );
    }
}

fn handle_system_event(app: &AppHandle, job_id: &str, value: &Value) {
    match value.get("subtype").and_then(|v| v.as_str()) {
        Some("api_retry") => {
            let attempt = value
                .get("attempt")
                .and_then(|v| v.as_u64())
                .map(|v| v.to_string())
                .unwrap_or_else(|| "?".to_string());
            let max = value
                .get("max_retries")
                .and_then(|v| v.as_u64())
                .map(|v| v.to_string())
                .unwrap_or_else(|| "?".to_string());
            emit_status(
                app,
                job_id,
                "thinking",
                Some(format!(
                    "Claude Code retrying API request ({attempt}/{max})"
                )),
            );
        }
        Some("plugin_install") => {
            let status = value
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("running");
            let name = value
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("plugins");
            emit_status(
                app,
                job_id,
                "thinking",
                Some(format!("Claude Code plugin install {status}: {name}")),
            );
        }
        Some("init") => {
            emit_status(
                app,
                job_id,
                "thinking",
                Some("Claude Code is running".to_string()),
            );
        }
        Some("status") => {
            if value.get("status").and_then(|v| v.as_str()) == Some("requesting") {
                emit_status(
                    app,
                    job_id,
                    "thinking",
                    Some("Claude Code is thinking".to_string()),
                );
            }
        }
        _ => {}
    }
}

fn handle_event(
    app: &AppHandle,
    job_id: &str,
    value: &Value,
    full: &mut String,
    tool_events: &mut Vec<AiStoredToolEvent>,
) -> Result<Option<bool>, String> {
    match value.get("type").and_then(|v| v.as_str()) {
        Some("stream_event") => {
            handle_stream_event(app, job_id, value, full, tool_events);
            Ok(None)
        }
        Some("assistant") => {
            handle_assistant_message(app, job_id, value, full, tool_events);
            Ok(None)
        }
        Some("user") => {
            handle_user_message(app, job_id, value, tool_events);
            Ok(None)
        }
        Some("system") => {
            handle_system_event(app, job_id, value);
            Ok(None)
        }
        Some("result") => {
            if value
                .get("is_error")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                return Err(value
                    .get("error")
                    .or_else(|| value.get("result"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Claude Code request failed")
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
pub async fn run_with_claude_code(
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
    let binary = find_claude_binary()?;
    let prompt = prompt_text(messages);

    emit_status(
        app,
        job_id,
        "thinking",
        Some("Starting Claude Code".to_string()),
    );

    let mut command = Command::new(binary);
    command
        .arg("-p")
        .arg("--input-format")
        .arg("text")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--verbose")
        .arg("--include-partial-messages")
        .arg("--no-session-persistence")
        .current_dir(root)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    match mode {
        AiAssistantMode::Chat => {
            command
                .arg("--permission-mode")
                .arg("dontAsk")
                .arg("--tools")
                .arg("");
        }
        AiAssistantMode::Create => {
            command
                .arg("--permission-mode")
                .arg("acceptEdits")
                .arg("--tools")
                .arg("Read,Edit,Write,Glob,Grep")
                .arg("--allowedTools")
                .arg("Read,Edit,Write,Glob,Grep");
        }
    }

    if !system.trim().is_empty() {
        command.arg("--append-system-prompt").arg(system.trim());
    }
    let model = profile.model.trim();
    if !model.is_empty() && model != DEFAULT_MODEL_ID {
        command.arg("--model").arg(model);
    }

    let mut child = KillChildOnDrop::new(
        command
            .spawn()
            .map_err(|e| format!("failed to start Claude Code: {e}"))?,
    );
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "failed to capture Claude Code stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture Claude Code stdout".to_string())?;
    let mut stdout_lines = BufReader::new(stdout).lines();
    let mut stderr_lines = pipe_stderr(&mut child).await;

    close_stdin(stdin, prompt).await?;

    let timeout = tokio::time::sleep(RUN_TIMEOUT);
    tokio::pin!(timeout);
    let startup_timeout = tokio::time::sleep(STARTUP_OUTPUT_TIMEOUT);
    tokio::pin!(startup_timeout);
    let mut full = String::new();
    let mut tool_events = Vec::new();
    let mut last_stderr = String::new();
    let mut saw_stdout = false;

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                stop_child(&mut child).await;
                return Ok((String::new(), true, tool_events));
            }
            _ = &mut timeout => {
                stop_child(&mut child).await;
                return Err("Claude Code request timed out".to_string());
            }
            _ = &mut startup_timeout, if !saw_stdout => {
                stop_child(&mut child).await;
                return Err(if last_stderr.trim().is_empty() {
                    "Claude Code produced no output after starting".to_string()
                } else {
                    format!("Claude Code produced no output after starting: {last_stderr}")
                });
            }
            maybe_err = stderr_lines.recv() => {
                if let Some(line) = maybe_err {
                    if !line.trim().is_empty() {
                        last_stderr = line;
                    }
                }
            }
            line = stdout_lines.next_line() => {
                let line = line.map_err(|e| format!("failed reading Claude Code output: {e}"))?;
                let Some(line) = line else {
                    let status = child.wait().await.map_err(|e| e.to_string())?;
                    if status.success() && !full.trim().is_empty() {
                        return Ok((full, false, tool_events));
                    }
                    return Err(if last_stderr.trim().is_empty() {
                        format!("Claude Code exited with {status}")
                    } else {
                        format!("Claude Code exited with {status}: {last_stderr}")
                    });
                };
                if line.trim().is_empty() {
                    continue;
                }
                saw_stdout = true;
                let value = serde_json::from_str::<Value>(&line)
                    .map_err(|e| format!("failed to parse Claude Code JSON output: {e}"))?;
                if let Some(done) = handle_event(app, job_id, &value, &mut full, &mut tool_events)? {
                    let _ = wait_after_result(&mut child, &last_stderr).await;
                    return Ok((full, done, tool_events));
                }
            }
        }
    }
}
