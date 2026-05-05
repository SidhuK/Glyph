use std::{
    collections::{HashMap, HashSet},
    net::TcpListener,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use futures_util::StreamExt;
use reqwest::Client;
use serde_json::{json, Value};
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
    types::AiModel,
    types::{AiAssistantMode, AiChunkEvent, AiMessage, AiProfile, AiStoredToolEvent},
};

const DEFAULT_MODEL_ID: &str = "opencode/default";
const SERVER_START_TIMEOUT: Duration = Duration::from_secs(20);
const RUN_TIMEOUT: Duration = Duration::from_secs(600);

struct OpenCodeServer {
    child: Child,
    client: Client,
    base_url: String,
}

impl OpenCodeServer {
    async fn stop(mut self) {
        let _ = self.child.kill().await;
        let _ = self.child.wait().await;
    }
}

fn find_opencode_binary() -> Result<PathBuf, String> {
    find_cli_binary("OpenCode", "OPENCODE_CLI_PATH", "opencode")
}

fn free_local_port() -> Result<u16, String> {
    // The caller retries if the child loses the short race to bind this port.
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    drop(listener);
    Ok(port)
}

async fn pipe_lines<R>(reader: R, tx: mpsc::Sender<String>)
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let _ = tx.send(line).await;
    }
}

async fn health_ready(client: &Client, base_url: &str) -> bool {
    client
        .get(format!("{base_url}/global/health"))
        .send()
        .await
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

fn is_port_bind_failure(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.contains("address already in use")
        || lower.contains("eaddrinuse")
        || lower.contains("addrinuse")
}

async fn start_server(root: &Path) -> Result<OpenCodeServer, String> {
    let binary = find_opencode_binary()?;
    let mut last_error = String::new();
    for _ in 0..3 {
        match start_server_on_port(root, &binary).await {
            Ok(server) => return Ok(server),
            Err(error) if is_port_bind_failure(&error) => {
                last_error = error;
            }
            Err(error) => return Err(error),
        }
    }
    Err(last_error)
}

async fn start_server_on_port(root: &Path, binary: &Path) -> Result<OpenCodeServer, String> {
    let port = free_local_port()?;
    let base_url = format!("http://127.0.0.1:{port}");
    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .user_agent("Glyph/0.1 (opencode)")
        .build()
        .map_err(|e| e.to_string())?;
    let mut child = Command::new(binary)
        .arg("serve")
        .arg("--hostname=127.0.0.1")
        .arg(format!("--port={port}"))
        .current_dir(root)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to start opencode: {e}"))?;

    let (tx, mut rx) = mpsc::channel::<String>(64);
    if let Some(stdout) = child.stdout.take() {
        tokio::spawn(pipe_lines(stdout, tx.clone()));
    }
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(pipe_lines(stderr, tx));
    }

    let deadline = Instant::now() + SERVER_START_TIMEOUT;
    let mut last_line = String::new();

    loop {
        if Instant::now() > deadline {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(if last_line.trim().is_empty() {
                "Timed out waiting for OpenCode server to start".to_string()
            } else {
                format!("Timed out waiting for OpenCode server to start: {last_line}")
            });
        }
        if let Ok(Some(status)) = child.try_wait() {
            return Err(if last_line.trim().is_empty() {
                format!("OpenCode server exited before it was ready: {status}")
            } else {
                format!("OpenCode server exited before it was ready: {status}: {last_line}")
            });
        }
        tokio::select! {
            maybe_line = rx.recv() => {
                if let Some(line) = maybe_line {
                    last_line = line.clone();
                    let lower = line.to_lowercase();
                    if lower.contains("opencode server listening on http://")
                        || lower.contains("listening on http://")
                    {
                        return Ok(OpenCodeServer { child, client, base_url });
                    }
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(200)) => {
                if health_ready(&client, &base_url).await {
                    return Ok(OpenCodeServer { child, client, base_url });
                }
            }
        }
    }
}

async fn get_json(
    client: &Client,
    base_url: &str,
    endpoint: &str,
    root: &Path,
) -> Result<Value, String> {
    let root_str = root.to_string_lossy().to_string();
    let response = client
        .get(format!("{base_url}{endpoint}"))
        .query(&[("directory", root_str.as_str())])
        .send()
        .await
        .map_err(|e| format!("OpenCode {endpoint} failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "OpenCode {endpoint} failed: {}",
            response.text().await.unwrap_or_default()
        ));
    }
    response.json::<Value>().await.map_err(|e| e.to_string())
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

fn modality_list(capabilities: &Value, key: &str) -> Option<Vec<String>> {
    let entries = capabilities.get(key)?.as_object()?;
    let modalities = entries
        .iter()
        .filter_map(|(name, enabled)| enabled.as_bool().filter(|v| *v).map(|_| name.clone()))
        .collect::<Vec<_>>();
    (!modalities.is_empty()).then_some(modalities)
}

fn supported_parameters(capabilities: &Value) -> Option<Vec<String>> {
    let mut parameters = Vec::new();
    for key in ["temperature", "reasoning", "attachment", "toolcall"] {
        if capabilities.get(key).and_then(|v| v.as_bool()) == Some(true) {
            parameters.push(key.to_string());
        }
    }
    (!parameters.is_empty()).then_some(parameters)
}

fn model_description(provider: &Value, model: &Value) -> Option<String> {
    let mut parts = Vec::new();
    if let Some(source) = provider.get("source").and_then(|v| v.as_str()) {
        parts.push(format!("Source: {source}"));
    }
    if let Some(status) = model.get("status").and_then(|v| v.as_str()) {
        parts.push(format!("Status: {status}"));
    }
    if let Some(family) = model.get("family").and_then(|v| v.as_str()) {
        parts.push(format!("Family: {family}"));
    }
    if model
        .get("providerID")
        .and_then(|v| v.as_str())
        .or_else(|| provider.get("id").and_then(|v| v.as_str()))
        == Some("opencode")
    {
        parts.push("OpenCode hosted model".to_string());
    }
    (!parts.is_empty()).then_some(parts.join(" | "))
}

fn default_model_ids(value: &Value) -> HashSet<String> {
    value
        .get("default")
        .and_then(|v| v.as_object())
        .map(|defaults| {
            defaults
                .values()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect::<HashSet<_>>()
        })
        .unwrap_or_default()
}

fn parse_provider_models(value: &Value, connected_only: bool) -> Vec<AiModel> {
    let providers = value
        .get("all")
        .or_else(|| value.get("providers"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let defaults = default_model_ids(value);
    let connected = value
        .get("connected")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect::<HashSet<_>>()
        })
        .unwrap_or_default();

    let mut entries = Vec::new();
    for provider in providers {
        let Some(provider_id) = provider.get("id").and_then(|v| v.as_str()) else {
            continue;
        };
        if connected_only && !connected.contains(provider_id) {
            continue;
        }
        let provider_name = provider
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(provider_id);
        let models = provider
            .get("models")
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_default();
        for (model_key, model) in models {
            let model_provider_id = model
                .get("providerID")
                .and_then(|v| v.as_str())
                .unwrap_or(provider_id);
            let model_id = model
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or(model_key.as_str());
            let provider_prefix = format!("{model_provider_id}/");
            let glyph_id = if model_id.starts_with(&provider_prefix) {
                model_id.to_string()
            } else {
                format!("{model_provider_id}/{model_id}")
            };
            let model_name = model
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or(model_id);
            let capabilities = model.get("capabilities").unwrap_or(&Value::Null);
            let limit = model.get("limit").unwrap_or(&Value::Null);
            let cost = model.get("cost").unwrap_or(&Value::Null);
            let is_default = defaults.contains(&glyph_id)
                || defaults.contains(model_id)
                || connected.contains(model_provider_id);
            entries.push((
                is_default,
                AiModel {
                    id: glyph_id,
                    name: format!("{provider_name}: {model_name}"),
                    context_length: value_as_u32(limit.get("context")),
                    description: model_description(&provider, &model),
                    input_modalities: modality_list(capabilities, "input"),
                    output_modalities: modality_list(capabilities, "output"),
                    tokenizer: None,
                    prompt_pricing: price_string(cost.get("input")),
                    completion_pricing: price_string(cost.get("output")),
                    supported_parameters: supported_parameters(capabilities),
                    max_completion_tokens: value_as_u32(limit.get("output")),
                    reasoning_effort: None,
                    default_reasoning_effort: None,
                },
            ));
        }
    }

    entries.sort_by(|(a_default, a), (b_default, b)| {
        b_default
            .cmp(a_default)
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.id.cmp(&b.id))
    });
    entries.into_iter().map(|(_, model)| model).collect()
}

pub async fn list_models(root: &Path) -> Result<Vec<AiModel>, String> {
    let server = start_server(root).await?;
    let result = async {
        let mut models =
            match get_json(&server.client, &server.base_url, "/config/providers", root).await {
                Ok(config_value) => parse_provider_models(&config_value, false),
                Err(_) => Vec::new(),
            };
        if models.is_empty() {
            let provider_value = get_json(&server.client, &server.base_url, "/provider", root)
                .await
                .unwrap_or(Value::Null);
            models = parse_provider_models(&provider_value, true);
        }
        if models.is_empty() {
            return Err("OpenCode returned no configured provider models".to_string());
        }
        Ok(models)
    }
    .await;
    server.stop().await;
    result
}

fn opencode_model(profile: &AiProfile) -> Option<Value> {
    let model = profile.model.trim();
    if model.is_empty() || model == DEFAULT_MODEL_ID {
        return None;
    }
    let (provider_id, model_id) = model.split_once('/')?;
    if provider_id.trim().is_empty() || model_id.trim().is_empty() {
        return None;
    }
    Some(json!({
        "providerID": provider_id.trim(),
        "modelID": model_id.trim()
    }))
}

fn input_text(messages: &[AiMessage]) -> String {
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

fn title_from_prompt(text: &str) -> String {
    let trimmed = text.trim().replace('\n', " ");
    if trimmed.chars().count() <= 64 {
        return trimmed;
    }
    format!("{}...", trimmed.chars().take(61).collect::<String>())
}

async fn create_session(
    client: &Client,
    base_url: &str,
    root: &Path,
    profile: &AiProfile,
    prompt: &str,
) -> Result<String, String> {
    let root_str = root.to_string_lossy().to_string();
    let mut body = json!({ "title": title_from_prompt(prompt) });
    if let Some(model) = opencode_model(profile) {
        body["model"] = json!({
            "providerID": model["providerID"].clone(),
            "id": model["modelID"].clone()
        });
    }
    let response = client
        .post(format!("{base_url}/session"))
        .query(&[("directory", root_str.as_str())])
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("failed to create OpenCode session: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "OpenCode session create failed: {}",
            response.text().await.unwrap_or_default()
        ));
    }
    let value = response.json::<Value>().await.map_err(|e| e.to_string())?;
    value
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "OpenCode session create returned no id".to_string())
}

async fn send_prompt_async(
    client: &Client,
    base_url: &str,
    root: &Path,
    session_id: &str,
    profile: &AiProfile,
    system: &str,
    prompt: &str,
) -> Result<(), String> {
    let root_str = root.to_string_lossy().to_string();
    let mut body = json!({
        "parts": [{ "type": "text", "text": prompt }]
    });
    if !system.trim().is_empty() {
        body["system"] = json!(system.trim());
    }
    if let Some(model) = opencode_model(profile) {
        body["model"] = model;
    }
    let response = client
        .post(format!("{base_url}/session/{session_id}/prompt_async"))
        .query(&[("directory", root_str.as_str())])
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("failed to send OpenCode prompt: {e}"))?;
    if response.status().is_success() {
        return Ok(());
    }
    Err(format!(
        "OpenCode prompt failed: {}",
        response.text().await.unwrap_or_default()
    ))
}

async fn abort_session(client: &Client, base_url: &str, session_id: &str) {
    let _ = client
        .post(format!("{base_url}/session/{session_id}/abort"))
        .send()
        .await;
}

fn error_message(value: &Value, fallback: &str) -> String {
    value
        .pointer("/properties/error/message")
        .or_else(|| value.pointer("/properties/error/data/message"))
        .or_else(|| value.pointer("/properties/error/type"))
        .and_then(|v| v.as_str())
        .unwrap_or(fallback)
        .to_string()
}

fn event_session_id(value: &Value) -> Option<&str> {
    value
        .pointer("/properties/sessionID")
        .and_then(|v| v.as_str())
}

fn tool_phase_for_status(status: &str) -> &'static str {
    match status {
        "pending" | "running" => "call",
        "completed" => "result",
        "error" => "error",
        _ => "call",
    }
}

enum EventOutcome {
    Continue,
    Done,
    Failed(String),
}

fn handle_event(
    app: &AppHandle,
    job_id: &str,
    session_id: &str,
    value: &Value,
    full: &mut String,
    tool_events: &mut Vec<AiStoredToolEvent>,
    tool_state: &mut HashMap<String, String>,
) -> EventOutcome {
    if matches!(event_session_id(value), Some(id) if id != session_id) {
        return EventOutcome::Continue;
    }

    let event_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");
    match event_type {
        "message.part.delta" => {
            if value
                .pointer("/properties/field")
                .and_then(|v| v.as_str())
                .is_some_and(|field| field != "text")
            {
                return EventOutcome::Continue;
            }
            if let Some(delta) = value.pointer("/properties/delta").and_then(|v| v.as_str()) {
                if !delta.is_empty() {
                    full.push_str(delta);
                    let _ = app.emit(
                        "ai:chunk",
                        AiChunkEvent {
                            job_id: job_id.to_string(),
                            delta: delta.to_string(),
                        },
                    );
                }
            }
        }
        "session.next.text.delta" => {
            if let Some(delta) = value.pointer("/properties/delta").and_then(|v| v.as_str()) {
                if !delta.is_empty() {
                    full.push_str(delta);
                    let _ = app.emit(
                        "ai:chunk",
                        AiChunkEvent {
                            job_id: job_id.to_string(),
                            delta: delta.to_string(),
                        },
                    );
                }
            }
        }
        "message.part.updated" => {
            let part = value.pointer("/properties/part").unwrap_or(&Value::Null);
            if part.get("type").and_then(|v| v.as_str()) == Some("tool") {
                let call_id = part
                    .get("callID")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let state = part.get("state").unwrap_or(&Value::Null);
                let status = state
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("pending");
                let state_key = call_id.clone().unwrap_or_else(|| {
                    part.get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("tool")
                        .to_string()
                });
                if tool_state.get(&state_key).map(String::as_str) != Some(status) {
                    tool_state.insert(state_key, status.to_string());
                    let tool = part.get("tool").and_then(|v| v.as_str()).unwrap_or("tool");
                    let error = if status == "error" {
                        state
                            .get("error")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                    } else {
                        None
                    };
                    emit_tool(
                        app,
                        job_id,
                        tool_events,
                        tool,
                        tool_phase_for_status(status),
                        call_id,
                        Some(part.clone()),
                        error,
                    );
                }
            }
        }
        "session.next.tool.called" => {
            let props = value.pointer("/properties").cloned();
            let call_id = value
                .pointer("/properties/callID")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let tool = value
                .pointer("/properties/tool")
                .and_then(|v| v.as_str())
                .unwrap_or("tool");
            emit_tool(app, job_id, tool_events, tool, "call", call_id, props, None);
        }
        "session.next.tool.success" => {
            let props = value.pointer("/properties").cloned();
            let call_id = value
                .pointer("/properties/callID")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            emit_tool(
                app,
                job_id,
                tool_events,
                "tool",
                "result",
                call_id,
                props,
                None,
            );
        }
        "session.next.tool.failed" => {
            let props = value.pointer("/properties").cloned();
            let call_id = value
                .pointer("/properties/callID")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let error = value
                .pointer("/properties/error/message")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            emit_tool(
                app,
                job_id,
                tool_events,
                "tool",
                "error",
                call_id,
                props,
                error,
            );
        }
        "file.edited" => {
            emit_tool(
                app,
                job_id,
                tool_events,
                "file",
                "result",
                None,
                value.pointer("/properties").cloned(),
                None,
            );
        }
        "command.executed" => {
            let tool = value
                .pointer("/properties/name")
                .and_then(|v| v.as_str())
                .unwrap_or("command");
            emit_tool(
                app,
                job_id,
                tool_events,
                tool,
                "result",
                None,
                value.pointer("/properties").cloned(),
                None,
            );
        }
        "session.error" => {
            return EventOutcome::Failed(error_message(value, "OpenCode session failed"));
        }
        "session.next.step.failed" => {
            return EventOutcome::Failed(error_message(value, "OpenCode step failed"));
        }
        "session.idle" => return EventOutcome::Done,
        "session.status" => {
            if value
                .pointer("/properties/status/type")
                .and_then(|v| v.as_str())
                == Some("idle")
            {
                return EventOutcome::Done;
            }
        }
        _ => {}
    }
    EventOutcome::Continue
}

fn parse_sse_events(buffer: &mut String, chunk: &[u8]) -> Vec<Value> {
    buffer.push_str(&String::from_utf8_lossy(chunk));
    let mut events = Vec::new();
    while let Some((index, delimiter_len)) = buffer
        .find("\r\n\r\n")
        .map(|index| (index, 4))
        .or_else(|| buffer.find("\n\n").map(|index| (index, 2)))
    {
        let raw = buffer[..index].to_string();
        buffer.drain(..index + delimiter_len);
        let mut data = String::new();
        for line in raw.lines() {
            if let Some(rest) = line.strip_prefix("data:") {
                if !data.is_empty() {
                    data.push('\n');
                }
                data.push_str(rest.trim_start());
            }
        }
        if data.trim().is_empty() {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<Value>(&data) {
            events.push(value);
        }
    }
    events
}

#[allow(clippy::too_many_arguments)]
pub async fn run_with_opencode(
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
    let _ = app.emit(
        "ai:status",
        AiStatusEvent {
            job_id: job_id.to_string(),
            status: "thinking".to_string(),
            detail: Some("Starting OpenCode".to_string()),
        },
    );

    let server = start_server(root).await?;
    let prompt = input_text(messages);
    let session_id =
        match create_session(&server.client, &server.base_url, root, profile, &prompt).await {
            Ok(session_id) => session_id,
            Err(err) => {
                server.stop().await;
                return Err(err);
            }
        };

    let root_str = root.to_string_lossy().to_string();
    let response = match server
        .client
        .get(format!("{}/event", server.base_url))
        .query(&[("directory", root_str.as_str())])
        .send()
        .await
    {
        Ok(response) => response,
        Err(err) => {
            server.stop().await;
            return Err(format!("failed to subscribe to OpenCode events: {err}"));
        }
    };
    if !response.status().is_success() {
        let message = response.text().await.unwrap_or_default();
        server.stop().await;
        return Err(format!("OpenCode event stream failed: {message}"));
    }

    if let Err(err) = send_prompt_async(
        &server.client,
        &server.base_url,
        root,
        &session_id,
        profile,
        system,
        &prompt,
    )
    .await
    {
        server.stop().await;
        return Err(err);
    }

    let _ = app.emit(
        "ai:status",
        AiStatusEvent {
            job_id: job_id.to_string(),
            status: "thinking".to_string(),
            detail: Some("OpenCode is running".to_string()),
        },
    );

    let mut stream = response.bytes_stream();
    let mut full = String::new();
    let mut buffer = String::new();
    let mut tool_events = Vec::new();
    let mut tool_state = HashMap::new();
    let deadline = tokio::time::sleep(RUN_TIMEOUT);
    tokio::pin!(deadline);

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                abort_session(&server.client, &server.base_url, &session_id).await;
                server.stop().await;
                return Ok((full, true, tool_events));
            }
            _ = &mut deadline => {
                abort_session(&server.client, &server.base_url, &session_id).await;
                server.stop().await;
                return Err("OpenCode session timed out".to_string());
            }
            maybe_chunk = stream.next() => {
                let Some(chunk) = maybe_chunk else {
                    server.stop().await;
                    return Err("OpenCode event stream closed before completion".to_string());
                };
                let chunk = match chunk {
                    Ok(chunk) => chunk,
                    Err(err) => {
                        server.stop().await;
                        return Err(format!("OpenCode event stream failed: {err}"));
                    }
                };
                for event in parse_sse_events(&mut buffer, &chunk) {
                    match handle_event(
                        app,
                        job_id,
                        &session_id,
                        &event,
                        &mut full,
                        &mut tool_events,
                        &mut tool_state,
                    ) {
                        EventOutcome::Continue => {}
                        EventOutcome::Done => {
                            server.stop().await;
                            return Ok((full, false, tool_events));
                        }
                        EventOutcome::Failed(message) => {
                            abort_session(&server.client, &server.base_url, &session_id).await;
                            server.stop().await;
                            return Err(message);
                        }
                    }
                }
            }
        }
    }
}
