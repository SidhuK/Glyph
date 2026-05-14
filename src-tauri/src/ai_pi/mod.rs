use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::mpsc,
};
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, warn};

use crate::ai_rig::{
    events::AiStatusEvent,
    helpers::{emit_tool, find_cli_binary},
    providers::build_transcript,
    types::{
        AiAssistantMode, AiChunkEvent, AiMessage, AiModel, AiProfile, AiReasoningEffortOption,
        AiStoredToolEvent,
    },
};

const RUN_TIMEOUT: Duration = Duration::from_secs(600);
const CONTROL_TIMEOUT: Duration = Duration::from_secs(30);
const STOP_TIMEOUT: Duration = Duration::from_secs(3);

fn find_pi_binary() -> Result<PathBuf, String> {
    find_cli_binary("PI", "PI_CLI_PATH", "pi")
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

async fn write_rpc(stdin: &mut ChildStdin, value: Value) -> Result<(), String> {
    let mut line = serde_json::to_vec(&value).map_err(|e| e.to_string())?;
    line.push(b'\n');
    stdin
        .write_all(&line)
        .await
        .map_err(|e| format!("failed writing to PI RPC: {e}"))?;
    stdin
        .flush()
        .await
        .map_err(|e| format!("failed flushing PI RPC: {e}"))
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
    let pid = child.id();
    debug!(?pid, "stopping PI subprocess");
    if let Err(e) = child.kill().await {
        debug!(?pid, error = %e, "PI subprocess kill returned an error");
    }
    match child.wait().await {
        Ok(status) => debug!(?pid, %status, "PI subprocess exited"),
        Err(e) => warn!(?pid, error = %e, "failed waiting for PI subprocess"),
    }
}

async fn abort_and_stop(child: &mut Child, stdin: &mut Option<ChildStdin>) {
    let pid = child.id();
    if let Some(mut child_stdin) = stdin.take() {
        debug!(?pid, "sending PI abort request");
        let _ = write_rpc(&mut child_stdin, json!({ "type": "abort" })).await;
    }
    if tokio::time::timeout(STOP_TIMEOUT, child.wait())
        .await
        .is_err()
    {
        warn!(?pid, "PI did not stop after abort request");
        stop_child(child).await;
    }
}

fn value_as_u32(value: Option<&Value>) -> Option<u32> {
    value
        .and_then(|v| v.as_u64())
        .and_then(|v| u32::try_from(v).ok())
}

fn price_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(|v| v.as_f64())
        .map(|v| {
            if v.fract() == 0.0 {
                format!("{v:.0}")
            } else {
                v.to_string()
            }
        })
        .filter(|v| v != "0")
}

fn string_list(value: Option<&Value>) -> Option<Vec<String>> {
    let items = value?
        .as_array()?
        .iter()
        .filter_map(|item| item.as_str().map(str::to_string))
        .collect::<Vec<_>>();
    (!items.is_empty()).then_some(items)
}

fn reasoning_options(model: &Value) -> Option<Vec<AiReasoningEffortOption>> {
    if model.get("reasoning").and_then(|v| v.as_bool()) != Some(true) {
        return None;
    }

    let mut levels = vec!["off", "minimal", "low", "medium", "high"];
    let map = model.get("thinkingLevelMap").and_then(|v| v.as_object());
    if map
        .and_then(|entries| entries.get("xhigh"))
        .map(|value| !value.is_null())
        .unwrap_or(false)
    {
        levels.push("xhigh");
    }

    let options = levels
        .into_iter()
        .filter(|level| {
            map.and_then(|entries| entries.get(*level))
                .map(|value| !value.is_null())
                .unwrap_or(true)
        })
        .map(|level| AiReasoningEffortOption {
            effort: level.to_string(),
            description: None,
        })
        .collect::<Vec<_>>();

    (!options.is_empty()).then_some(options)
}

fn parse_pi_model(value: &Value) -> Option<AiModel> {
    let id = value.get("id")?.as_str()?.to_string();
    let raw_name = value.get("name").and_then(|v| v.as_str()).unwrap_or(&id);
    let provider = value.get("provider").and_then(|v| v.as_str());
    let name = match provider {
        Some(provider)
            if !provider.trim().is_empty()
                && !raw_name
                    .to_lowercase()
                    .contains(&provider.trim().to_lowercase()) =>
        {
            format!("{}: {}", provider.trim(), raw_name)
        }
        _ => raw_name.to_string(),
    };
    let cost = value.get("cost").unwrap_or(&Value::Null);
    let reasoning_effort = reasoning_options(value);

    Some(AiModel {
        id,
        name,
        context_length: value_as_u32(value.get("contextWindow")),
        description: provider.map(|provider| format!("PI provider: {provider}")),
        input_modalities: string_list(value.get("input")),
        output_modalities: None,
        tokenizer: None,
        prompt_pricing: price_string(cost.get("input")),
        completion_pricing: price_string(cost.get("output")),
        supported_parameters: Some(
            ["tools"]
                .into_iter()
                .chain(reasoning_effort.is_some().then_some("reasoning"))
                .map(str::to_string)
                .collect(),
        ),
        max_completion_tokens: value_as_u32(value.get("maxTokens")),
        reasoning_effort,
        default_reasoning_effort: value
            .get("reasoning")
            .and_then(|v| v.as_bool())
            .filter(|v| *v)
            .map(|_| "medium".to_string()),
    })
}

async fn spawn_rpc(
    root: &Path,
    offline: bool,
    profile: Option<&AiProfile>,
) -> Result<Child, String> {
    let binary = find_pi_binary()?;
    let model = profile.map(|profile| profile.model.trim()).unwrap_or("");
    debug!(
        binary = %binary.display(),
        root = %root.display(),
        offline,
        model,
        "spawning PI RPC subprocess"
    );
    let mut command = Command::new(binary);
    command
        .arg("--mode")
        .arg("rpc")
        .arg("--no-session")
        .current_dir(root)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    if offline {
        command.arg("--offline");
    }
    if let Some(profile) = profile {
        if !model.is_empty() {
            command.arg("--model").arg(model);
        }
        if let Some(effort) = profile.reasoning_effort.as_deref().map(str::trim) {
            if !effort.is_empty() {
                let effort = effort.to_ascii_lowercase();
                if !matches!(
                    effort.as_str(),
                    "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
                ) {
                    return Err(format!("Unsupported PI reasoning effort: {effort}"));
                }
                command.arg("--thinking").arg(effort);
            }
        }
    }

    command.kill_on_drop(true);
    let child = command.spawn().map_err(|e| {
        error!(error = %e, "failed to start PI subprocess");
        format!("failed to start PI: {e}")
    })?;
    info!(pid = ?child.id(), offline, model, "started PI RPC subprocess");
    Ok(child)
}

pub async fn list_models(root: &Path) -> Result<Vec<AiModel>, String> {
    let started = Instant::now();
    let mut child = spawn_rpc(root, true, None).await?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "failed to capture PI stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture PI stdout".to_string())?;
    let mut stdout_lines = BufReader::new(stdout).lines();
    let mut stderr_lines = pipe_stderr(&mut child).await;
    let deadline = tokio::time::sleep(CONTROL_TIMEOUT);
    tokio::pin!(deadline);

    write_rpc(
        &mut stdin,
        json!({ "id": "glyph-models", "type": "get_available_models" }),
    )
    .await?;

    let mut last_stderr = String::new();
    loop {
        tokio::select! {
            _ = &mut deadline => {
                warn!(
                    duration_ms = started.elapsed().as_millis(),
                    "timed out waiting for PI models"
                );
                stop_child(&mut child).await;
                return Err(if last_stderr.trim().is_empty() {
                    "Timed out waiting for PI models".to_string()
                } else {
                    format!("Timed out waiting for PI models: {last_stderr}")
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
                let line = match line {
                    Ok(line) => line,
                    Err(e) => {
                        error!(error = %e, "failed reading PI model output");
                        stop_child(&mut child).await;
                        return Err(format!("failed reading PI output: {e}"));
                    }
                };
                let Some(line) = line else {
                    let status = child.wait().await.map_err(|e| e.to_string())?;
                    return Err(if last_stderr.trim().is_empty() {
                        format!("PI exited before returning models: {status}")
                    } else {
                        format!("PI exited before returning models: {status}: {last_stderr}")
                    });
                };
                if line.trim().is_empty() {
                    continue;
                }
                let value = match serde_json::from_str::<Value>(&line) {
                    Ok(value) => value,
                    Err(e) => {
                        error!(error = %e, "failed to parse PI model JSON output");
                        stop_child(&mut child).await;
                        return Err(format!("failed to parse PI JSON output: {e}"));
                    }
                };
                if value.get("type").and_then(|v| v.as_str()) != Some("response")
                    || value.get("id").and_then(|v| v.as_str()) != Some("glyph-models")
                {
                    continue;
                }
                if value.get("success").and_then(|v| v.as_bool()) != Some(true) {
                    error!("PI model list failed");
                    stop_child(&mut child).await;
                    return Err(value.get("error").and_then(|v| v.as_str()).unwrap_or("PI model list failed").to_string());
                }
                let mut models = value
                    .pointer("/data/models")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default()
                    .iter()
                    .filter_map(parse_pi_model)
                    .collect::<Vec<_>>();
                models.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.id.cmp(&b.id)));
                info!(
                    model_count = models.len(),
                    duration_ms = started.elapsed().as_millis(),
                    "loaded PI models"
                );
                stop_child(&mut child).await;
                if models.is_empty() {
                    return Err("PI returned no available models".to_string());
                }
                return Ok(models);
            }
        }
    }
}

fn extract_text_from_message(message: &Value) -> String {
    message
        .get("content")
        .and_then(|v| v.as_array())
        .map(|items| {
            let mut out = String::new();
            for item in items {
                match item.get("type").and_then(|v| v.as_str()) {
                    Some("text") => {
                        if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                            out.push_str(text);
                        }
                    }
                    Some("thinking") => {
                        if let Some(thinking) = item.get("thinking").and_then(|v| v.as_str()) {
                            push_thinking_block(&mut out, thinking);
                        }
                    }
                    _ => {}
                }
            }
            out
        })
        .unwrap_or_default()
}

fn agent_end_text(value: &Value) -> String {
    value
        .get("messages")
        .and_then(|v| v.as_array())
        .and_then(|messages| {
            messages.iter().rev().find_map(|message| {
                (message.get("role").and_then(|v| v.as_str()) == Some("assistant"))
                    .then(|| extract_text_from_message(message))
                    .filter(|text| !text.trim().is_empty())
            })
        })
        .unwrap_or_default()
}

fn emit_chunk(app: &AppHandle, job_id: &str, full: &mut String, delta: String) {
    if delta.is_empty() {
        return;
    }
    full.push_str(&delta);
    let _ = app.emit(
        "ai:chunk",
        AiChunkEvent {
            job_id: job_id.to_string(),
            delta,
        },
    );
}

fn push_thinking_block(out: &mut String, thinking: &str) {
    if !out.ends_with("\n\n") && !out.is_empty() {
        out.push_str("\n\n");
    }
    out.push_str("> Thinking\n");
    for line in thinking.lines() {
        out.push_str("> ");
        out.push_str(line);
        out.push('\n');
    }
    out.push('\n');
}

fn thinking_delta(delta: &str, line_start: &mut bool) -> String {
    let mut out = String::new();
    for segment in delta.split_inclusive('\n') {
        if out.is_empty() && *line_start && segment.chars().all(|c| matches!(c, '\n' | '\r')) {
            continue;
        }
        if *line_start {
            out.push_str("> ");
            *line_start = false;
        }
        out.push_str(segment);
        if segment.ends_with('\n') {
            *line_start = true;
        }
    }
    out
}

fn handle_message_update(
    app: &AppHandle,
    job_id: &str,
    value: &Value,
    full: &mut String,
    in_thinking: &mut bool,
    thinking_line_start: &mut bool,
    thinking_has_content: &mut bool,
) {
    let event = value.get("assistantMessageEvent").unwrap_or(&Value::Null);
    match event.get("type").and_then(|v| v.as_str()) {
        Some("text_delta") => {
            if let Some(delta) = event.get("delta").and_then(|v| v.as_str()) {
                emit_chunk(app, job_id, full, delta.to_string());
            }
        }
        Some("thinking_start") => {
            *in_thinking = true;
            *thinking_line_start = true;
            *thinking_has_content = false;
        }
        Some("thinking_delta") => {
            if !*in_thinking {
                *in_thinking = true;
                *thinking_line_start = true;
                *thinking_has_content = false;
            }
            if let Some(delta) = event.get("delta").and_then(|v| v.as_str()) {
                let delta = thinking_delta(delta, thinking_line_start);
                if delta.trim().is_empty() {
                    *thinking_line_start = true;
                } else {
                    if !*thinking_has_content {
                        if !full.ends_with("\n\n") && !full.is_empty() {
                            emit_chunk(app, job_id, full, "\n\n".to_string());
                        }
                        emit_chunk(app, job_id, full, "> Thinking\n".to_string());
                    }
                    emit_chunk(app, job_id, full, delta);
                    *thinking_has_content = true;
                }
            }
        }
        Some("thinking_end") => {
            if *in_thinking {
                if *thinking_has_content {
                    emit_chunk(app, job_id, full, "\n\n".to_string());
                }
                *in_thinking = false;
                *thinking_line_start = false;
                *thinking_has_content = false;
            }
        }
        _ => {}
    }
}

fn handle_tool_event(
    app: &AppHandle,
    job_id: &str,
    value: &Value,
    tool_events: &mut Vec<AiStoredToolEvent>,
) {
    let event_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let phase = match event_type {
        "tool_execution_start" | "tool_execution_update" => "call",
        "tool_execution_end" => {
            if value.get("isError").and_then(|v| v.as_bool()) == Some(true) {
                "error"
            } else {
                "result"
            }
        }
        _ => return,
    };
    let tool = value
        .get("toolName")
        .and_then(|v| v.as_str())
        .unwrap_or("tool");
    debug!(job_id, tool, phase, "PI tool event");
    let call_id = value
        .get("toolCallId")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let error = (phase == "error").then(|| {
        value
            .pointer("/result/error")
            .or_else(|| value.pointer("/result/message"))
            .and_then(|v| v.as_str())
            .unwrap_or("PI tool failed")
            .to_string()
    });

    emit_tool(
        app,
        job_id,
        tool_events,
        tool,
        phase,
        call_id,
        Some(value.clone()),
        error,
    );
}

#[allow(clippy::too_many_arguments)]
pub async fn run_with_pi(
    cancel: &CancellationToken,
    app: &AppHandle,
    job_id: &str,
    profile: &AiProfile,
    system: &str,
    messages: &[AiMessage],
    _mode: &AiAssistantMode,
    space_root: Option<&Path>,
) -> Result<(String, bool, Vec<AiStoredToolEvent>), String> {
    let started = Instant::now();
    let root = space_root.ok_or_else(|| "No space is open".to_string())?;
    let prompt = prompt_text(system, messages);
    debug!(
        job_id,
        model = profile.model.as_str(),
        prompt_len = prompt.len(),
        "starting PI prompt"
    );

    let _ = app.emit(
        "ai:status",
        AiStatusEvent {
            job_id: job_id.to_string(),
            status: "thinking".to_string(),
            detail: Some("Starting PI".to_string()),
        },
    );

    let mut child = spawn_rpc(root, false, Some(profile)).await?;
    let mut stdin = child.stdin.take();
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture PI stdout".to_string())?;
    let mut stdout_lines = BufReader::new(stdout).lines();
    let mut stderr_lines = pipe_stderr(&mut child).await;
    let deadline = tokio::time::sleep(RUN_TIMEOUT);
    tokio::pin!(deadline);

    if let Some(child_stdin) = &mut stdin {
        write_rpc(
            child_stdin,
            json!({ "id": "glyph-prompt", "type": "prompt", "message": prompt }),
        )
        .await
        .map_err(|e| {
            error!(job_id, error = %e, "failed writing PI prompt");
            e
        })?;
    } else {
        return Err("failed to capture PI stdin".to_string());
    }

    let _ = app.emit(
        "ai:status",
        AiStatusEvent {
            job_id: job_id.to_string(),
            status: "thinking".to_string(),
            detail: Some("PI is running".to_string()),
        },
    );

    let mut full = String::new();
    let mut tool_events = Vec::new();
    let mut last_stderr = String::new();
    let mut in_thinking = false;
    let mut thinking_line_start = false;
    let mut thinking_has_content = false;

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                info!(
                    job_id,
                    duration_ms = started.elapsed().as_millis(),
                    "PI request cancelled"
                );
                abort_and_stop(&mut child, &mut stdin).await;
                return Ok((full, true, tool_events));
            }
            _ = &mut deadline => {
                warn!(
                    job_id,
                    duration_ms = started.elapsed().as_millis(),
                    "PI request timed out"
                );
                abort_and_stop(&mut child, &mut stdin).await;
                return Err("PI request timed out".to_string());
            }
            maybe_err = stderr_lines.recv() => {
                if let Some(line) = maybe_err {
                    if !line.trim().is_empty() {
                        last_stderr = line;
                    }
                }
            }
            line = stdout_lines.next_line() => {
                let line = match line {
                    Ok(line) => line,
                    Err(e) => {
                        error!(job_id, error = %e, "failed reading PI output");
                        abort_and_stop(&mut child, &mut stdin).await;
                        return Err(format!("failed reading PI output: {e}"));
                    }
                };
                let Some(line) = line else {
                    let status = child.wait().await.map_err(|e| e.to_string())?;
                    if status.success() && (!full.trim().is_empty() || !tool_events.is_empty()) {
                        info!(
                            job_id,
                            duration_ms = started.elapsed().as_millis(),
                            tool_events = tool_events.len(),
                            "PI request completed"
                        );
                        return Ok((full, false, tool_events));
                    }
                    return Err(if last_stderr.trim().is_empty() {
                        format!("PI exited before completion: {status}")
                    } else {
                        format!("PI exited before completion: {status}: {last_stderr}")
                    });
                };
                if line.trim().is_empty() {
                    continue;
                }
                let value = match serde_json::from_str::<Value>(&line) {
                    Ok(value) => value,
                    Err(e) => {
                        error!(job_id, error = %e, "failed to parse PI JSON output");
                        abort_and_stop(&mut child, &mut stdin).await;
                        return Err(format!("failed to parse PI JSON output: {e}"));
                    }
                };
                match value.get("type").and_then(|v| v.as_str()) {
                    Some("response") if value.get("id").and_then(|v| v.as_str()) == Some("glyph-prompt") => {
                        if value.get("success").and_then(|v| v.as_bool()) != Some(true) {
                            abort_and_stop(&mut child, &mut stdin).await;
                            return Err(value.get("error").and_then(|v| v.as_str()).unwrap_or("PI prompt failed").to_string());
                        }
                    }
                    Some("message_update") => {
                        handle_message_update(
                            app,
                            job_id,
                            &value,
                            &mut full,
                            &mut in_thinking,
                            &mut thinking_line_start,
                            &mut thinking_has_content,
                        );
                    }
                    Some("tool_execution_start") | Some("tool_execution_update") | Some("tool_execution_end") => {
                        handle_tool_event(app, job_id, &value, &mut tool_events);
                    }
                    Some("agent_end") => {
                        if full.trim().is_empty() {
                            full = agent_end_text(&value);
                            if !full.is_empty() {
                                let _ = app.emit(
                                    "ai:chunk",
                                    AiChunkEvent {
                                        job_id: job_id.to_string(),
                                        delta: full.clone(),
                                    },
                                );
                            }
                        }
                        stop_child(&mut child).await;
                        if full.trim().is_empty() && tool_events.is_empty() {
                            return Err("PI returned an empty response".to_string());
                        }
                        info!(
                            job_id,
                            duration_ms = started.elapsed().as_millis(),
                            tool_events = tool_events.len(),
                            "PI agent ended"
                        );
                        return Ok((full, false, tool_events));
                    }
                    _ => {}
                }
            }
        }
    }
}
