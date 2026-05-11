use std::{path::Path, time::Duration};

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
    helpers::{emit_tool, find_cli_binary},
    providers::build_transcript,
    types::{AiAssistantMode, AiChunkEvent, AiMessage, AiModel, AiProfile, AiStoredToolEvent},
};

const RUN_TIMEOUT: Duration = Duration::from_secs(600);

fn find_claude_binary() -> Result<std::path::PathBuf, String> {
    find_cli_binary("Claude Code", "CLAUDE_CLI_PATH", "claude")
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

fn permission_mode(mode: &AiAssistantMode) -> &'static str {
    match mode {
        AiAssistantMode::Chat => "plan",
        AiAssistantMode::Create => "acceptEdits",
    }
}

fn pipe_stderr(child: &mut Child) -> mpsc::Receiver<String> {
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

fn auth_error_message(message: &str) -> Option<String> {
    let lower = message.to_lowercase();
    (lower.contains("auth")
        || lower.contains("login")
        || lower.contains("not logged in")
        || lower.contains("unauthorized"))
    .then(|| "Claude Code is not authenticated. Run `claude auth login` in your terminal, then retry in Glyph.".to_string())
}

fn emit_text(app: &AppHandle, job_id: &str, full: &mut String, text: &str) {
    if text.is_empty() {
        return;
    }
    full.push_str(text);
    let _ = app.emit(
        "ai:chunk",
        AiChunkEvent {
            job_id: job_id.to_string(),
            delta: text.to_string(),
        },
    );
}

fn handle_content_part(
    app: &AppHandle,
    job_id: &str,
    part: &Value,
    full: &mut String,
    tool_events: &mut Vec<AiStoredToolEvent>,
    emitted_stream_delta: bool,
) {
    match part.get("type").and_then(|v| v.as_str()) {
        Some("text") if !emitted_stream_delta => {
            if let Some(text) = part.get("text").and_then(|v| v.as_str()) {
                emit_text(app, job_id, full, text);
            }
        }
        Some("tool_use") => {
            let tool = part.get("name").and_then(|v| v.as_str()).unwrap_or("tool");
            let call_id = part
                .get("id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            emit_tool(
                app,
                job_id,
                tool_events,
                tool,
                "call",
                call_id,
                Some(part.clone()),
                None,
            );
        }
        _ => {}
    }
}

fn handle_claude_event(
    app: &AppHandle,
    job_id: &str,
    value: &Value,
    full: &mut String,
    tool_events: &mut Vec<AiStoredToolEvent>,
    emitted_stream_delta: &mut bool,
) -> Result<Option<bool>, String> {
    match value.get("type").and_then(|v| v.as_str()) {
        Some("stream_event") => {
            let event = value.get("event").unwrap_or(&Value::Null);
            if event.get("type").and_then(|v| v.as_str()) == Some("content_block_delta") {
                if let Some(text) = event.pointer("/delta/text").and_then(|v| v.as_str()) {
                    *emitted_stream_delta = true;
                    emit_text(app, job_id, full, text);
                }
            }
            Ok(None)
        }
        Some("assistant") => {
            if let Some(content) = value.pointer("/message/content").and_then(|v| v.as_array()) {
                for part in content {
                    handle_content_part(
                        app,
                        job_id,
                        part,
                        full,
                        tool_events,
                        *emitted_stream_delta,
                    );
                }
            }
            Ok(None)
        }
        Some("user") => {
            if let Some(content) = value.pointer("/message/content").and_then(|v| v.as_array()) {
                for part in content {
                    if part.get("type").and_then(|v| v.as_str()) != Some("tool_result") {
                        continue;
                    }
                    let call_id = part
                        .get("tool_use_id")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let is_error = part
                        .get("is_error")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    let error = is_error
                        .then(|| part.get("content").and_then(|v| v.as_str()).unwrap_or(""))
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string());
                    emit_tool(
                        app,
                        job_id,
                        tool_events,
                        "tool",
                        if is_error { "error" } else { "result" },
                        call_id,
                        Some(part.clone()),
                        error,
                    );
                }
            }
            Ok(None)
        }
        Some("result") => {
            if value
                .get("is_error")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                let raw = value
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Claude Code request failed");
                return Err(auth_error_message(raw).unwrap_or_else(|| raw.to_string()));
            }
            if full.trim().is_empty() {
                if let Some(result) = value.get("result").and_then(|v| v.as_str()) {
                    emit_text(app, job_id, full, result);
                }
            }
            Ok(Some(false))
        }
        _ => Ok(None),
    }
}

pub fn list_models(_profile: &AiProfile) -> Result<Vec<AiModel>, String> {
    let _ = find_claude_binary()?;
    Ok([
        (
            "default",
            "Claude Code default",
            "Use the Claude Code CLI default model.",
        ),
        ("sonnet", "Claude Sonnet", "Use Claude Code's Sonnet alias."),
        ("opus", "Claude Opus", "Use Claude Code's Opus alias."),
        ("haiku", "Claude Haiku", "Use Claude Code's Haiku alias."),
    ]
    .into_iter()
    .map(|(id, name, description)| AiModel {
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
    })
    .collect())
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
    let prompt = prompt_text(system, messages);
    let binary = find_claude_binary()?;

    let _ = app.emit(
        "ai:status",
        AiStatusEvent {
            job_id: job_id.to_string(),
            status: "thinking".to_string(),
            detail: Some("Starting Claude Code".to_string()),
        },
    );

    let mut command = Command::new(binary);
    command
        .arg("--print")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--verbose")
        .arg("--include-partial-messages")
        .arg("--permission-mode")
        .arg(permission_mode(mode));
    if !profile.model.trim().is_empty() && profile.model.trim() != "default" {
        command.arg("--model").arg(profile.model.trim());
    }
    command
        .arg(prompt)
        .current_dir(root)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|e| format!("failed to start Claude Code: {e}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture Claude Code stdout".to_string())?;
    let mut stdout_lines = BufReader::new(stdout).lines();
    let mut stderr_lines = pipe_stderr(&mut child);
    let deadline = tokio::time::sleep(RUN_TIMEOUT);
    tokio::pin!(deadline);

    let mut full = String::new();
    let mut tool_events = Vec::new();
    let mut last_stderr = String::new();
    let mut emitted_stream_delta = false;

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                stop_child(&mut child).await;
                return Ok((full, true, tool_events));
            }
            _ = &mut deadline => {
                stop_child(&mut child).await;
                return Err("Claude Code request timed out".to_string());
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
                    if status.success() {
                        return Ok((full, false, tool_events));
                    }
                    let detail = if last_stderr.trim().is_empty() {
                        format!("Claude Code exited with {status}")
                    } else {
                        format!("Claude Code exited with {status}: {last_stderr}")
                    };
                    return Err(auth_error_message(&detail).unwrap_or(detail));
                };
                if line.trim().is_empty() {
                    continue;
                }
                let value = serde_json::from_str::<Value>(&line)
                    .map_err(|e| format!("failed to parse Claude Code JSON output: {e}"))?;
                if let Some(cancelled) = handle_claude_event(
                    app,
                    job_id,
                    &value,
                    &mut full,
                    &mut tool_events,
                    &mut emitted_stream_delta,
                )? {
                    let _ = child.wait().await;
                    return Ok((full, cancelled, tool_events));
                }
            }
        }
    }
}
