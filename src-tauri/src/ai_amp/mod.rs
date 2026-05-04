use std::{
    env,
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
    helpers::now_ms,
    providers::build_transcript,
    types::{
        AiAssistantMode, AiChunkEvent, AiMessage, AiModel, AiProfile, AiStoredToolEvent,
        AiToolEvent,
    },
};

const RUN_TIMEOUT: Duration = Duration::from_secs(600);

fn executable_exists(path: &Path) -> bool {
    path.is_file()
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME").map(PathBuf::from)
}

fn candidate_binary_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(path) = env::var_os("AMP_CLI_PATH") {
        paths.push(PathBuf::from(path));
    }
    if let Some(path) = env::var_os("PATH") {
        paths.extend(env::split_paths(&path).map(|dir| dir.join("amp")));
    }
    paths.push(PathBuf::from("/opt/homebrew/bin/amp"));
    paths.push(PathBuf::from("/usr/local/bin/amp"));
    paths.push(PathBuf::from("/usr/bin/amp"));
    if let Some(home) = home_dir() {
        paths.push(home.join(".local/bin/amp"));
        paths.push(home.join(".bun/bin/amp"));
        paths.push(home.join(".npm-global/bin/amp"));
        paths.push(home.join(".volta/bin/amp"));
    }
    paths
}

fn find_amp_binary() -> Result<PathBuf, String> {
    for path in candidate_binary_paths() {
        if executable_exists(&path) {
            return Ok(path);
        }
    }
    Err("Amp CLI not found. Install amp or set AMP_CLI_PATH to the native binary.".to_string())
}

fn mode_from_profile(profile: &AiProfile) -> &str {
    let mode = profile.model.trim();
    if mode.is_empty() {
        "smart"
    } else {
        mode
    }
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

fn emit_tool(
    app: &AppHandle,
    job_id: &str,
    tool_events: &mut Vec<AiStoredToolEvent>,
    tool: &str,
    phase: &str,
    call_id: Option<String>,
    payload: Option<Value>,
    error: Option<String>,
) {
    let at_ms = now_ms();
    let _ = app.emit(
        "ai:tool",
        AiToolEvent {
            job_id: job_id.to_string(),
            tool: tool.to_string(),
            phase: phase.to_string(),
            at_ms,
            call_id: call_id.clone(),
            payload: payload.clone(),
            error: error.clone(),
        },
    );
    tool_events.push(AiStoredToolEvent {
        tool: tool.to_string(),
        phase: phase.to_string(),
        at_ms,
        call_id,
        payload,
        error,
    });
}

fn handle_amp_event(
    app: &AppHandle,
    job_id: &str,
    value: &Value,
    full: &mut String,
    tool_events: &mut Vec<AiStoredToolEvent>,
) -> Result<Option<bool>, String> {
    match value.get("type").and_then(|v| v.as_str()) {
        Some("assistant") => {
            let parent_tool_id = value
                .get("parent_tool_use_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            if let Some(content) = value.pointer("/message/content").and_then(|v| v.as_array()) {
                for part in content {
                    match part.get("type").and_then(|v| v.as_str()) {
                        Some("text") if parent_tool_id.is_none() => {
                            if let Some(text) = part.get("text").and_then(|v| v.as_str()) {
                                if !text.is_empty() {
                                    full.push_str(text);
                                    let _ = app.emit(
                                        "ai:chunk",
                                        AiChunkEvent {
                                            job_id: job_id.to_string(),
                                            delta: text.to_string(),
                                        },
                                    );
                                }
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
                return Err(value
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Amp request failed")
                    .to_string());
            }
            if full.trim().is_empty() {
                if let Some(result) = value.get("result").and_then(|v| v.as_str()) {
                    full.push_str(result);
                    let _ = app.emit(
                        "ai:chunk",
                        AiChunkEvent {
                            job_id: job_id.to_string(),
                            delta: result.to_string(),
                        },
                    );
                }
            }
            Ok(Some(false))
        }
        _ => Ok(None),
    }
}

pub fn list_models() -> Vec<AiModel> {
    [
        (
            "smart",
            "Smart",
            "State-of-the-art Amp mode for maximum capability and autonomy.",
        ),
        (
            "rush",
            "Rush",
            "Faster, cheaper Amp mode for small well-defined tasks.",
        ),
        ("deep", "Deep", "Deep reasoning Amp mode for complex work."),
        (
            "large",
            "Large",
            "Large-context Amp mode for broad codebase tasks.",
        ),
    ]
    .into_iter()
    .map(|(id, name, description)| AiModel {
        id: id.to_string(),
        name: format!("Amp {name}"),
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
    .collect()
}

#[allow(clippy::too_many_arguments)]
pub async fn run_with_amp(
    cancel: &CancellationToken,
    app: &AppHandle,
    job_id: &str,
    profile: &AiProfile,
    system: &str,
    messages: &[AiMessage],
    _mode: &AiAssistantMode,
    space_root: Option<&Path>,
) -> Result<(String, bool, Vec<AiStoredToolEvent>), String> {
    let root = space_root.ok_or_else(|| "No space is open".to_string())?;
    let prompt = prompt_text(system, messages);
    let binary = find_amp_binary()?;

    let _ = app.emit(
        "ai:status",
        AiStatusEvent {
            job_id: job_id.to_string(),
            status: "thinking".to_string(),
            detail: Some("Starting Amp".to_string()),
        },
    );

    let mut child = Command::new(binary)
        .arg("--no-color")
        .arg("--dangerously-allow-all")
        .arg("--mode")
        .arg(mode_from_profile(profile))
        .arg("--execute")
        .arg(prompt)
        .arg("--stream-json")
        .current_dir(root)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to start amp: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture Amp stdout".to_string())?;
    let mut stdout_lines = BufReader::new(stdout).lines();
    let mut stderr_lines = pipe_stderr(&mut child).await;
    let deadline = tokio::time::sleep(RUN_TIMEOUT);
    tokio::pin!(deadline);

    let mut full = String::new();
    let mut tool_events = Vec::new();
    let mut last_stderr = String::new();

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                stop_child(&mut child).await;
                return Ok((full, true, tool_events));
            }
            _ = &mut deadline => {
                stop_child(&mut child).await;
                return Err("Amp request timed out".to_string());
            }
            maybe_err = stderr_lines.recv() => {
                if let Some(line) = maybe_err {
                    if !line.trim().is_empty() {
                        last_stderr = line;
                    }
                }
            }
            line = stdout_lines.next_line() => {
                let line = line.map_err(|e| format!("failed reading Amp output: {e}"))?;
                let Some(line) = line else {
                    let status = child.wait().await.map_err(|e| e.to_string())?;
                    if status.success() {
                        return Ok((full, false, tool_events));
                    }
                    return Err(if last_stderr.trim().is_empty() {
                        format!("Amp exited with {status}")
                    } else {
                        format!("Amp exited with {status}: {last_stderr}")
                    });
                };
                if line.trim().is_empty() {
                    continue;
                }
                let value = serde_json::from_str::<Value>(&line)
                    .map_err(|e| format!("failed to parse Amp JSON output: {e}"))?;
                if let Some(cancelled) = handle_amp_event(
                    app,
                    job_id,
                    &value,
                    &mut full,
                    &mut tool_events,
                )? {
                    let _ = child.wait().await;
                    return Ok((full, cancelled, tool_events));
                }
            }
        }
    }
}
