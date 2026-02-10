use std::path::Path;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::time::{sleep, Duration};
use tokio_util::sync::CancellationToken;

use super::helpers::{parse_base_url, with_tool_protocol};
use super::streaming::{stream_anthropic, stream_gemini, stream_openai_like};
use super::tools::execute_tool_call;
use super::types::{
    AgentToolCall, AiChunkEvent, AiMessage, AiProfile, AiProviderKind, AiStoredToolEvent,
    AiToolEvent,
};

const MAX_AGENT_STEPS: usize = 6;
const MAX_TOOL_RESULT_CHARS: usize = 120_000;
const FAKE_CHUNK_CHARS: usize = 48;
const FAKE_CHUNK_DELAY_MS: u64 = 14;

enum AgentOutput { ToolCall(AgentToolCall), Final(String), Plain(String) }

pub async fn run_agent_loop(
    client: &reqwest::Client,
    cancel: &CancellationToken,
    app: &AppHandle,
    job_id: &str,
    profile: &AiProfile,
    api_key: Option<&str>,
    system: &str,
    messages: &[AiMessage],
    vault_root: Option<&Path>,
) -> Result<(String, bool, Vec<AiStoredToolEvent>), String> {
    let system = with_tool_protocol(system);
    let mut convo = messages.to_vec();
    let mut total_tool_chars = 0usize;
    let mut tool_events: Vec<AiStoredToolEvent> = Vec::new();
    for _ in 0..MAX_AGENT_STEPS {
        let (raw, cancelled) = call_provider_once(client, cancel, app, job_id, profile, api_key, &system, &convo).await?;
        if cancelled { return Ok((String::new(), true, tool_events)); }
        match parse_output(&raw) {
            AgentOutput::ToolCall(call) => {
                let call_event = emit_tool(
                    app,
                    job_id,
                    &call.name,
                    "call",
                    call.call_id.clone(),
                    Some(call.args.clone()),
                    None,
                );
                tool_events.push(call_event);
                let result = match vault_root {
                    Some(root) => execute_tool_call(root, &call.name, call.args.clone()).await,
                    None => Err("No vault is open".to_string()),
                };
                convo.push(AiMessage { role: "assistant".to_string(), content: raw });
                match result {
                    Ok(payload) => {
                        let payload_len = serde_json::to_string(&payload).map(|s| s.len()).unwrap_or(0);
                        total_tool_chars += payload_len;
                        if total_tool_chars > MAX_TOOL_RESULT_CHARS {
                            let text = "Tool result budget reached. Please ask a narrower follow-up.";
                            emit_fake_chunks(cancel, app, job_id, text).await;
                            return Ok((text.to_string(), false, tool_events));
                        }
                        let result_event = emit_tool(
                            app,
                            job_id,
                            &call.name,
                            "result",
                            call.call_id.clone(),
                            Some(payload.clone()),
                            None,
                        );
                        tool_events.push(result_event);
                        convo.push(tool_result_message(&call, Some(payload), None));
                    }
                    Err(err) => {
                        total_tool_chars += err.len();
                        if total_tool_chars > MAX_TOOL_RESULT_CHARS {
                            let text = "Tool result budget reached. Please ask a narrower follow-up.";
                            emit_fake_chunks(cancel, app, job_id, text).await;
                            return Ok((text.to_string(), false, tool_events));
                        }
                        let error_event = emit_tool(
                            app,
                            job_id,
                            &call.name,
                            "error",
                            call.call_id.clone(),
                            None,
                            Some(err.clone()),
                        );
                        tool_events.push(error_event);
                        convo.push(tool_result_message(&call, None, Some(err)));
                    }
                }
            }
            AgentOutput::Final(text) | AgentOutput::Plain(text) => {
                emit_fake_chunks(cancel, app, job_id, &text).await;
                return Ok((text, false, tool_events));
            }
        }
    }
    let text = "Agent tool-call cap reached. Please ask a narrower follow-up.";
    emit_fake_chunks(cancel, app, job_id, text).await;
    Ok((text.to_string(), false, tool_events))
}

async fn call_provider_once(
    client: &reqwest::Client,
    cancel: &CancellationToken,
    app: &AppHandle,
    job_id: &str,
    profile: &AiProfile,
    api_key: Option<&str>,
    system: &str,
    messages: &[AiMessage],
) -> Result<(String, bool), String> {
    match profile.provider {
        AiProviderKind::Openai | AiProviderKind::OpenaiCompat | AiProviderKind::Openrouter | AiProviderKind::Ollama => {
            if matches!(profile.provider, AiProviderKind::Openai | AiProviderKind::Openrouter) && api_key.unwrap_or_default().trim().is_empty() {
                return Err("API key not set for this profile".to_string());
            }
            let base = parse_base_url(profile)?;
            let url = base.join("chat/completions").map_err(|e| e.to_string())?;
            let mut prompt_messages = messages.to_vec();
            if !system.is_empty() {
                prompt_messages.insert(0, AiMessage { role: "system".to_string(), content: system.to_string() });
            }
            let body = json!({
                "model": profile.model,
                "messages": prompt_messages.into_iter().map(|m| json!({"role": m.role, "content": m.content})).collect::<Vec<_>>(),
                "temperature": 0.2,
                "stream": true
            });
            stream_openai_like(client, cancel, app, job_id, false, profile, api_key, body, url).await
        }
        AiProviderKind::Anthropic => {
            let base = parse_base_url(profile)?;
            let url = base.join("v1/messages").map_err(|e| e.to_string())?;
            stream_anthropic(client, cancel, app, job_id, false, profile, api_key.unwrap_or_default(), system, messages, url).await
        }
        AiProviderKind::Gemini => {
            let base = parse_base_url(profile)?;
            stream_gemini(client, cancel, app, job_id, false, profile, api_key.unwrap_or_default(), system, messages, base).await
        }
    }
}

fn parse_output(raw: &str) -> AgentOutput {
    let trimmed = extract_payload(raw).trim().to_string();
    if trimmed.is_empty() { return AgentOutput::Final(String::new()); }
    let Ok(v) = serde_json::from_str::<Value>(&trimmed) else { return AgentOutput::Plain(trimmed); };
    if let Some(text) = extract_final_text(&v) {
        return AgentOutput::Final(text);
    }
    if let Some(call) = parse_tool_call(&v) {
        return AgentOutput::ToolCall(call);
    }
    AgentOutput::Plain(trimmed)
}

fn extract_payload(raw: &str) -> &str {
    let trimmed = raw.trim();
    let start_tag = "<function_calls>";
    let end_tag = "</function_calls>";
    if let (Some(s), Some(e)) = (trimmed.find(start_tag), trimmed.find(end_tag)) {
        if e > s + start_tag.len() {
            return trimmed[s + start_tag.len()..e].trim();
        }
    }
    trimmed
}

fn parse_tool_call(v: &Value) -> Option<AgentToolCall> {
    match v {
        Value::Object(map) => {
            if map.get("type").and_then(|x| x.as_str()) == Some("function_calls") {
                return map.get("calls").and_then(parse_tool_call);
            }
            if let Some(inner) = map.get("function_calls") {
                return parse_tool_call(inner);
            }
            parse_tool_call_object(v)
        }
        Value::Array(arr) => arr.iter().find_map(parse_tool_call),
        _ => None,
    }
}

fn extract_final_text(v: &Value) -> Option<String> {
    match v {
        Value::Object(map) => {
            let ty = map.get("type").and_then(|x| x.as_str()).unwrap_or("");
            if ty == "final" {
                return map
                    .get("text")
                    .or_else(|| map.get("content"))
                    .or_else(|| map.get("message"))
                    .and_then(|x| x.as_str())
                    .map(normalize_final_text)
                    .or_else(|| Some(String::new()));
            }
            for key in ["final", "response", "output"] {
                if let Some(inner) = map.get(key) {
                    if let Some(text) = extract_final_text(inner) {
                        return Some(text);
                    }
                }
            }
            None
        }
        Value::Array(arr) => arr.iter().find_map(extract_final_text),
        Value::String(s) => {
            let nested = s.trim();
            if !(nested.starts_with('{') || nested.starts_with('[')) {
                return None;
            }
            serde_json::from_str::<Value>(nested)
                .ok()
                .and_then(|inner| extract_final_text(&inner))
        }
        _ => None,
    }
}

fn normalize_final_text(text: &str) -> String {
    let trimmed = text.trim();
    if !(trimmed.starts_with('{') || trimmed.starts_with('[')) {
        return text.to_string();
    }
    if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
        if let Some(extracted) = extract_final_text(&v) {
            return extracted;
        }
    }
    text.to_string()
}

fn parse_tool_call_object(v: &Value) -> Option<AgentToolCall> {
    let ty = v.get("type").and_then(|x| x.as_str()).unwrap_or("");
    if !ty.is_empty() && ty != "tool_call" {
        return None;
    }
    let name = v
        .get("name")
        .or_else(|| v.get("tool"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if name.is_empty() {
        return None;
    }
    let args = v
        .get("args")
        .cloned()
        .or_else(|| v.get("arguments").cloned())
        .or_else(|| v.get("input").cloned())
        .and_then(|x| match x {
            Value::String(s) => serde_json::from_str::<Value>(&s).ok(),
            other => Some(other),
        })
        .unwrap_or_else(|| json!({}));
    let call_id = v
        .get("call_id")
        .or_else(|| v.get("id"))
        .and_then(|x| x.as_str())
        .map(ToString::to_string);
    Some(AgentToolCall {
        call_id,
        name,
        args,
    })
}

fn tool_result_message(call: &AgentToolCall, payload: Option<Value>, error: Option<String>) -> AiMessage {
    AiMessage {
        role: "user".to_string(),
        content: json!({
            "type": "tool_result",
            "call_id": call.call_id,
            "name": call.name,
            "ok": error.is_none(),
            "result": payload,
            "error": error,
        }).to_string(),
    }
}

async fn emit_fake_chunks(
    cancel: &CancellationToken,
    app: &AppHandle,
    job_id: &str,
    text: &str,
) {
    let mut chunk = String::new();
    let mut n = 0usize;
    for ch in text.chars() {
        if cancel.is_cancelled() {
            return;
        }
        chunk.push(ch);
        n += 1;
        if n >= FAKE_CHUNK_CHARS {
            let _ = app.emit("ai:chunk", AiChunkEvent { job_id: job_id.to_string(), delta: chunk.clone() });
            chunk.clear();
            n = 0;
            sleep(Duration::from_millis(FAKE_CHUNK_DELAY_MS)).await;
        }
    }
    if !chunk.is_empty() { let _ = app.emit("ai:chunk", AiChunkEvent { job_id: job_id.to_string(), delta: chunk }); }
}

fn emit_tool(
    app: &AppHandle,
    job_id: &str,
    tool: &str,
    phase: &str,
    call_id: Option<String>,
    payload: Option<Value>,
    error: Option<String>,
) -> AiStoredToolEvent {
    let at_ms = super::helpers::now_ms();
    let _ = app.emit("ai:tool", AiToolEvent {
        job_id: job_id.to_string(),
        tool: tool.to_string(),
        phase: phase.to_string(),
        at_ms,
        call_id: call_id.clone(),
        payload: payload.clone(),
        error: error.clone(),
    });
    AiStoredToolEvent {
        tool: tool.to_string(),
        phase: phase.to_string(),
        at_ms,
        call_id,
        payload,
        error,
    }
}
