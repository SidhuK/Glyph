use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;

use crate::ai_rig::events::AiStatusEvent;
use crate::ai_rig::providers::build_transcript;
use crate::ai_rig::types::{
    AiAssistantMode, AiChunkEvent, AiDoneEvent, AiErrorEvent, AiMessage, AiProfile,
    AiStoredToolEvent, AiToolEvent,
};

use super::state::CodexState;
use super::transport::{latest_seq, rpc_call, wait_notification_after};

fn as_text_input(system: &str, messages: &[AiMessage]) -> String {
    let transcript = build_transcript(system, messages);
    if transcript.trim().is_empty() {
        messages
            .iter()
            .rev()
            .find(|m| m.role == "user")
            .map(|m| m.content.clone())
            .unwrap_or_default()
    } else {
        transcript
    }
}

fn extract_delta(params: &Value) -> Option<String> {
    params
        .get("delta")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            params
                .pointer("/delta/text")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .or_else(|| {
            params
                .get("textDelta")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .or_else(|| {
            params
                .get("text")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
}

fn extract_turn_id(v: &Value) -> Option<String> {
    v.get("turnId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            v.get("turn")
                .and_then(|t| t.get("id"))
                .and_then(|id| id.as_str())
                .map(|s| s.to_string())
        })
}

fn extract_thread_id(v: &Value) -> Option<String> {
    v.get("threadId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            v.get("thread")
                .and_then(|t| t.get("id"))
                .and_then(|id| id.as_str())
                .map(|s| s.to_string())
        })
}

fn parse_item_type(params: &Value) -> Option<String> {
    params
        .get("item")
        .and_then(|i| i.get("type"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            params
                .get("type")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
}

fn parse_item_status(params: &Value) -> Option<String> {
    params
        .get("item")
        .and_then(|i| i.get("status"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            params
                .get("status")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
}

fn is_tool_type(item_type: &str) -> bool {
    matches!(
        item_type,
        "commandExecution"
            | "fileChange"
            | "webSearch"
            | "mcpToolCall"
            | "collabToolCall"
            | "imageGeneration"
            | "readFile"
            | "writeFile"
            | "listDir"
            | "search"
    )
}

fn push_tool_event(
    app: &AppHandle,
    job_id: &str,
    tool_events: &mut Vec<AiStoredToolEvent>,
    tool: &str,
    phase: &str,
    payload: Option<Value>,
    error: Option<String>,
) {
    let at_ms = crate::ai_rig::helpers::now_ms();
    let _ = app.emit(
        "ai:tool",
        AiToolEvent {
            job_id: job_id.to_string(),
            tool: tool.to_string(),
            phase: phase.to_string(),
            at_ms,
            call_id: None,
            payload: payload.clone(),
            error: error.clone(),
        },
    );
    tool_events.push(AiStoredToolEvent {
        tool: tool.to_string(),
        phase: phase.to_string(),
        at_ms,
        call_id: None,
        payload,
        error,
    });
}

#[allow(clippy::too_many_arguments)]
pub async fn run_with_codex(
    codex_state: State<'_, CodexState>,
    cancel: &CancellationToken,
    app: &AppHandle,
    job_id: &str,
    profile: &AiProfile,
    system: &str,
    messages: &[AiMessage],
    _mode: &AiAssistantMode,
    vault_root: Option<&std::path::Path>,
    thread_hint: Option<&str>,
) -> Result<(String, bool, Vec<AiStoredToolEvent>), String> {
    let root = vault_root.ok_or_else(|| "No vault is open".to_string())?;

    let _ = app.emit(
        "ai:status",
        AiStatusEvent {
            job_id: job_id.to_string(),
            status: "thinking".to_string(),
            detail: None,
        },
    );

    let model = if profile.model.trim().is_empty() {
        "gpt-5.1-codex"
    } else {
        profile.model.trim()
    };

    let input_text = as_text_input(system, messages);
    let root_str = root.to_string_lossy().to_string();

    let thread_id = {
        if let Some(existing) = thread_hint {
            if existing.starts_with("thr_") {
                let resumed = rpc_call(
                    codex_state.inner(),
                    "thread/resume",
                    json!({ "threadId": existing }),
                    Duration::from_secs(20),
                )?;
                if let Some(thread_id) = extract_thread_id(&resumed) {
                    thread_id
                } else {
                    let started = rpc_call(
                        codex_state.inner(),
                        "thread/start",
                        json!({
                            "model": model,
                            "cwd": root_str.clone(),
                            "approvalPolicy": "never"
                        }),
                        Duration::from_secs(20),
                    )?;
                    extract_thread_id(&started)
                        .or_else(|| {
                            started
                                .get("id")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                        })
                        .ok_or_else(|| "missing thread id from codex thread/start".to_string())?
                }
            } else {
                let started = rpc_call(
                    codex_state.inner(),
                    "thread/start",
                    json!({
                        "model": model,
                        "cwd": root_str.clone(),
                        "approvalPolicy": "never"
                    }),
                    Duration::from_secs(20),
                )?;
                extract_thread_id(&started)
                    .or_else(|| {
                        started
                            .get("id")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                    })
                    .ok_or_else(|| "missing thread id from codex thread/start".to_string())?
            }
        } else {
            let started = rpc_call(
                codex_state.inner(),
                "thread/start",
                json!({
                    "model": model,
                    "cwd": root_str.clone(),
                    "approvalPolicy": "never"
                }),
                Duration::from_secs(20),
            )?;
            extract_thread_id(&started)
                .or_else(|| {
                    started
                        .get("id")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
                .ok_or_else(|| "missing thread id from codex thread/start".to_string())?
        }
    };

    let mut seq = latest_seq(codex_state.inner())?;
    let mut turn_params = json!({
        "threadId": thread_id,
        "input": [
            {
                "type": "text",
                "text": input_text
            }
        ],
        "model": model,
        "cwd": root_str.clone(),
        "approvalPolicy": "never",
        "sandboxPolicy": {
            "type": "workspaceWrite",
            "writableRoots": [root_str.clone()],
            "networkAccess": true
        }
    });
    if let Some(effort) = profile
        .reasoning_effort
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        if let Some(obj) = turn_params.as_object_mut() {
            obj.insert("effort".to_string(), json!(effort));
        }
    }
    let started = rpc_call(
        codex_state.inner(),
        "turn/start",
        turn_params,
        Duration::from_secs(30),
    )?;
    let turn_id = extract_turn_id(&started)
        .or_else(|| {
            started
                .get("id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .ok_or_else(|| "missing turn id from codex turn/start".to_string())?;

    let mut full = String::new();
    let mut tool_events: Vec<AiStoredToolEvent> = Vec::new();
    let mut interrupted = false;
    let deadline = Instant::now() + Duration::from_secs(600);

    loop {
        if Instant::now() > deadline {
            return Err("codex turn timed out".to_string());
        }

        if cancel.is_cancelled() && !interrupted {
            interrupted = true;
            let _ = rpc_call(
                codex_state.inner(),
                "turn/interrupt",
                json!({ "threadId": thread_id }),
                Duration::from_secs(10),
            );
        }

        let maybe_notification =
            wait_notification_after(codex_state.inner(), seq, Duration::from_millis(500))?;

        let Some(notification) = maybe_notification else {
            continue;
        };

        seq = notification.seq;
        let method = notification.method.as_str();
        let params = &notification.params;

        if method == "item/agentMessage/delta" {
            if let Some(delta) = extract_delta(params) {
                if !delta.is_empty() {
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
            continue;
        }

        if method == "item/started" {
            if let Some(item_type) = parse_item_type(params) {
                if is_tool_type(&item_type) {
                    push_tool_event(
                        app,
                        job_id,
                        &mut tool_events,
                        &item_type,
                        "call",
                        params.get("item").cloned().or_else(|| Some(params.clone())),
                        None,
                    );
                }
            }
            continue;
        }

        if method == "item/completed" {
            if let Some(item_type) = parse_item_type(params) {
                if item_type == "agentMessage" && full.trim().is_empty() {
                    if let Some(text) = params
                        .pointer("/item/text")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .or_else(|| {
                            params
                                .pointer("/item/content")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                        })
                    {
                        full = text;
                    }
                }
                if is_tool_type(&item_type) {
                    let status =
                        parse_item_status(params).unwrap_or_else(|| "completed".to_string());
                    let is_error = matches!(status.as_str(), "failed" | "error" | "cancelled");
                    push_tool_event(
                        app,
                        job_id,
                        &mut tool_events,
                        &item_type,
                        if is_error { "error" } else { "result" },
                        params.get("item").cloned().or_else(|| Some(params.clone())),
                        if is_error {
                            params
                                .get("error")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                                .or_else(|| Some(format!("{item_type} {status}")))
                        } else {
                            None
                        },
                    );
                }
            }
            continue;
        }

        if method == "turn/completed" {
            let completed_turn_id = extract_turn_id(params);
            if completed_turn_id.as_deref() == Some(turn_id.as_str()) || completed_turn_id.is_none()
            {
                let status = params
                    .get("turn")
                    .and_then(|v| v.get("status"))
                    .and_then(|v| v.as_str())
                    .or_else(|| params.get("status").and_then(|v| v.as_str()))
                    .unwrap_or("completed");
                if status == "failed" {
                    return Err(params
                        .get("turn")
                        .and_then(|v| v.get("error"))
                        .and_then(|v| v.get("message"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| "codex turn failed".to_string()));
                }
                let cancelled = interrupted || status == "interrupted" || status == "cancelled";
                let _ = app.emit(
                    "ai:done",
                    AiDoneEvent {
                        job_id: job_id.to_string(),
                        cancelled,
                    },
                );
                return Ok((full, cancelled, tool_events));
            }
            continue;
        }

        if method == "turn/failed" {
            let failed_turn_id = extract_turn_id(params);
            if failed_turn_id.as_deref() == Some(turn_id.as_str()) || failed_turn_id.is_none() {
                let message = params
                    .get("error")
                    .and_then(|v| v.get("message"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("codex turn failed")
                    .to_string();
                let _ = app.emit(
                    "ai:error",
                    AiErrorEvent {
                        job_id: job_id.to_string(),
                        message: message.clone(),
                    },
                );
                return Err(message);
            }
        }

        if method == "codex/process/exited" {
            return Err("codex app-server process exited".to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{extract_delta, is_tool_type};
    use serde_json::json;

    #[test]
    fn extract_delta_from_multiple_shapes() {
        let a = json!({"delta": "hello"});
        assert_eq!(extract_delta(&a).as_deref(), Some("hello"));

        let b = json!({"delta": {"text": "world"}});
        assert_eq!(extract_delta(&b).as_deref(), Some("world"));

        let c = json!({"textDelta": "!"});
        assert_eq!(extract_delta(&c).as_deref(), Some("!"));
    }

    #[test]
    fn tool_type_filtering_is_reasonable() {
        assert!(is_tool_type("search"));
        assert!(is_tool_type("commandExecution"));
        assert!(!is_tool_type("agentMessage"));
        assert!(!is_tool_type("userMessage"));
    }
}
