use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;
use url::Url;

use crate::net;
use super::helpers::apply_extra_headers;
use super::types::{AiChunkEvent, AiMessage, AiProfile};

pub async fn stream_openai_like(
    client: &reqwest::Client,
    cancel: &CancellationToken,
    app: &AppHandle,
    job_id: &str,
    profile: &AiProfile,
    api_key: Option<&str>,
    body: serde_json::Value,
    url: Url,
) -> Result<(String, bool), String> {
    let mut req = client.post(url).json(&body);
    if let Some(key) = api_key {
        if !key.trim().is_empty() {
            req = req.bearer_auth(key);
        }
    }
    req = apply_extra_headers(req, profile);

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let msg = resp.text().await.unwrap_or_default();
        return Err(format!("http {status}: {msg}"));
    }

    let mut cancelled = false;
    let mut full = String::new();
    let mut buf = String::new();
    let mut stream = resp.bytes_stream();

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                cancelled = true;
                break;
            }
            item = stream.next() => {
                let Some(item) = item else { break; };
                let chunk = item.map_err(|e| e.to_string())?;
                buf.push_str(&String::from_utf8_lossy(&chunk));
                while let Some(idx) = buf.find("\n\n") {
                    let raw = buf[..idx].to_string();
                    buf = buf[idx + 2..].to_string();
                    let mut data = String::new();
                    for line in raw.lines() {
                        let line = line.trim();
                        if let Some(rest) = line.strip_prefix("data:") {
                            let part = rest.trim_start();
                            data.push_str(part);
                        }
                    }
                    let data = data.trim();
                    if data.is_empty() {
                        continue;
                    }
                    if data == "[DONE]" {
                        return Ok((full, cancelled));
                    }
                    let v: serde_json::Value = match serde_json::from_str(data) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    let delta = v
                        .pointer("/choices/0/delta/content")
                        .and_then(|v| v.as_str())
                        .or_else(|| v.pointer("/choices/0/message/content").and_then(|v| v.as_str()))
                        .unwrap_or("");
                    if delta.is_empty() {
                        continue;
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
            }
        }
    }

    Ok((full, cancelled))
}

pub async fn stream_anthropic(
    client: &reqwest::Client,
    cancel: &CancellationToken,
    app: &AppHandle,
    job_id: &str,
    profile: &AiProfile,
    api_key: &str,
    system: &str,
    messages: &[AiMessage],
    url: Url,
) -> Result<(String, bool), String> {
    if api_key.trim().is_empty() {
        return Err("API key not set for this profile".to_string());
    }

    let converted: Vec<serde_json::Value> = messages
        .iter()
        .filter_map(|m| match m.role.as_str() {
            "user" | "assistant" => Some(serde_json::json!({
                "role": m.role,
                "content": m.content
            })),
            _ => None,
        })
        .collect();

    let body = serde_json::json!({
        "model": profile.model,
        "max_tokens": 1024,
        "temperature": 0.2,
        "system": if system.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(system.to_string()) },
        "messages": converted,
        "stream": true
    });

    let mut req = client
        .post(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body);
    req = apply_extra_headers(req, profile);

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let msg = resp.text().await.unwrap_or_default();
        return Err(format!("http {status}: {msg}"));
    }

    let mut cancelled = false;
    let mut full = String::new();
    let mut buf = String::new();
    let mut stream = resp.bytes_stream();

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                cancelled = true;
                break;
            }
            item = stream.next() => {
                let Some(item) = item else { break; };
                let chunk = item.map_err(|e| e.to_string())?;
                buf.push_str(&String::from_utf8_lossy(&chunk));
                while let Some(idx) = buf.find("\n\n") {
                    let raw = buf[..idx].to_string();
                    buf = buf[idx + 2..].to_string();

                    let mut data = String::new();
                    for line in raw.lines() {
                        let line = line.trim();
                        if let Some(rest) = line.strip_prefix("data:") {
                            data.push_str(rest.trim_start());
                        }
                    }
                    let data = data.trim();
                    if data.is_empty() {
                        continue;
                    }
                    let v: serde_json::Value = match serde_json::from_str(data) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    let ty = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    if ty == "message_stop" {
                        return Ok((full, cancelled));
                    }
                    let delta = v
                        .pointer("/delta/text")
                        .and_then(|t| t.as_str())
                        .unwrap_or("");
                    if delta.is_empty() {
                        continue;
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
            }
        }
    }

    Ok((full, cancelled))
}

pub async fn stream_gemini(
    client: &reqwest::Client,
    cancel: &CancellationToken,
    app: &AppHandle,
    job_id: &str,
    profile: &AiProfile,
    api_key: &str,
    system: &str,
    messages: &[AiMessage],
    base: Url,
) -> Result<(String, bool), String> {
    if api_key.trim().is_empty() {
        return Err("API key not set for this profile".to_string());
    }

    let mut prompt = String::new();
    if !system.trim().is_empty() {
        prompt.push_str(system.trim());
        prompt.push_str("\n\n");
    }
    for m in messages {
        let role = m.role.trim();
        if role != "user" && role != "assistant" {
            continue;
        }
        prompt.push_str(role);
        prompt.push_str(": ");
        prompt.push_str(m.content.trim());
        prompt.push('\n');
    }

    let url = base
        .join(&format!(
            "v1beta/models/{}:streamGenerateContent",
            profile.model
        ))
        .map_err(|e| e.to_string())?;
    let url = Url::parse(&format!("{url}?alt=sse&key={}", api_key.trim()))
        .map_err(|_| "invalid gemini request url".to_string())?;
    net::validate_url_host(&url, false)?;

    let body = serde_json::json!({
        "contents": [{
            "parts": [{"text": prompt}]
        }]
    });

    let mut req = client.post(url).json(&body);
    req = apply_extra_headers(req, profile);

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let msg = resp.text().await.unwrap_or_default();
        return Err(format!("http {status}: {msg}"));
    }

    let mut cancelled = false;
    let mut full = String::new();
    let mut buf = String::new();
    let mut stream = resp.bytes_stream();

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                cancelled = true;
                break;
            }
            item = stream.next() => {
                let Some(item) = item else { break; };
                let chunk = item.map_err(|e| e.to_string())?;
                buf.push_str(&String::from_utf8_lossy(&chunk));
                while let Some(idx) = buf.find("\n\n") {
                    let raw = buf[..idx].to_string();
                    buf = buf[idx + 2..].to_string();
                    let mut data = String::new();
                    for line in raw.lines() {
                        let line = line.trim();
                        if let Some(rest) = line.strip_prefix("data:") {
                            data.push_str(rest.trim_start());
                        }
                    }
                    let data = data.trim();
                    if data.is_empty() || data == "[DONE]" {
                        continue;
                    }
                    let v: serde_json::Value = match serde_json::from_str(data) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    let text = v
                        .pointer("/candidates/0/content/parts/0/text")
                        .and_then(|t| t.as_str())
                        .unwrap_or("");
                    if text.is_empty() {
                        continue;
                    }
                    let delta = if text.starts_with(&full) {
                        text[full.len()..].to_string()
                    } else {
                        text.to_string()
                    };
                    if delta.is_empty() {
                        continue;
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
            }
        }
    }

    Ok((full, cancelled))
}
