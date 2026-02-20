use std::collections::HashMap;
use std::path::Path;

use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

use rig::{
    agent::{Agent, AgentBuilder, AgentBuilderSimple, MultiTurnStreamItem},
    client::CompletionClient,
    completion::Prompt,
    message::ToolResultContent,
    providers::{anthropic, gemini, ollama, openai, openrouter},
    streaming::{StreamedAssistantContent, StreamedUserContent, StreamingPrompt},
};

use crate::ai_rig::{
    helpers::{default_base_url, parse_base_url},
    types::{
        AiAssistantMode, AiChunkEvent, AiMessage, AiProfile, AiProviderKind, AiStoredToolEvent,
    },
};

use super::{
    events::AiStatusEvent,
    providers::{build_transcript, capabilities},
    tools::ToolBundle,
};

const TITLE_PREAMBLE: &str = "Generate concise chat titles. Return only a short title (3-6 words), no quotes, no punctuation-heavy output.";
const CREATE_MODE_DISCIPLINE_PREAMBLE: &str = "Tool discipline for this run: use the minimum number of tool calls needed. Prefer at most 1-2 search/list calls before answering. If a tool returns usable evidence, stop searching and summarize what you found with uncertainty notes rather than continuing to explore.";

fn is_not_chat_model_error(err: &str) -> bool {
    let lower = err.to_lowercase();
    lower.contains("not a chat model")
        || lower.contains("not supported in the v1/chat/completions endpoint")
}

fn not_chat_model_message(model: &str) -> String {
    format!(
        "Model '{}' is not chat-completions compatible. Select a chat model (for example: gpt-4o, gpt-4.1, gpt-4.1-mini, gpt-4o-mini).",
        model
    )
}

pub async fn run_with_rig(
    cancel: &CancellationToken,
    app: &AppHandle,
    job_id: &str,
    profile: &AiProfile,
    api_key: Option<&str>,
    system: &str,
    messages: &[AiMessage],
    mode: &AiAssistantMode,
    vault_root: Option<&Path>,
) -> Result<(String, bool, Vec<AiStoredToolEvent>), String> {
    let root = vault_root.ok_or_else(|| "No vault is open".to_string())?;
    let effective_system = if matches!(mode, AiAssistantMode::Create) {
        if system.trim().is_empty() {
            CREATE_MODE_DISCIPLINE_PREAMBLE.to_string()
        } else {
            format!("{CREATE_MODE_DISCIPLINE_PREAMBLE}\n\n{}", system.trim())
        }
    } else {
        system.to_string()
    };
    let transcript = build_transcript(&effective_system, messages);
    let tools = ToolBundle::new(root.to_path_buf());
    let caps = capabilities(&profile.provider);
    let max_tokens = if caps.requires_max_tokens {
        Some(2048)
    } else {
        None
    };
    let http_client = build_http_client(profile)?;
    let custom_base_url = profile
        .base_url
        .as_deref()
        .map(|_| parse_base_url(profile))
        .transpose()
        .map_err(|e| e.to_string())?
        .map(|u| u.to_string());

    let _ = app.emit(
        "ai:status",
        AiStatusEvent {
            job_id: job_id.to_string(),
            status: "thinking".to_string(),
            detail: None,
        },
    );

    let (full, tool_events, cancelled) = match profile.provider {
        AiProviderKind::Openai => {
            let key = require_key(api_key)?;
            let client = if let Some(base_url) = custom_base_url.as_deref() {
                openai::Client::builder(key)
                    .with_client(http_client.clone())
                    .base_url(base_url)
                    .build()
            } else {
                openai::Client::builder(key)
                    .with_client(http_client.clone())
                    .build()
            };
            let model = client
                .completion_model(profile.model.trim())
                .completions_api();
            let mut agent = AgentBuilder::new(model);
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            let agent = if matches!(mode, AiAssistantMode::Create) {
                with_tools(agent.preamble(&effective_system), &tools).build()
            } else {
                agent.preamble(&effective_system).build()
            };
            match run_stream(
                cancel,
                app,
                job_id,
                agent,
                transcript.clone(),
            )
            .await
            {
                Ok(v) => v,
                Err(e) if is_not_chat_model_error(&e) => {
                    return Err(not_chat_model_message(profile.model.trim()));
                }
                Err(e) => return Err(e),
            }
        }
        AiProviderKind::OpenaiCompat => {
            let key = api_key.unwrap_or("").trim();
            let base = custom_base_url
                .as_deref()
                .unwrap_or(default_base_url(&AiProviderKind::OpenaiCompat));
            let client = openai::Client::builder(key)
                .with_client(http_client.clone())
                .base_url(base)
                .build();
            let model = client
                .completion_model(profile.model.trim())
                .completions_api();
            let mut agent = AgentBuilder::new(model);
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            let agent = if matches!(mode, AiAssistantMode::Create) {
                with_tools(agent.preamble(&effective_system), &tools).build()
            } else {
                agent.preamble(&effective_system).build()
            };
            match run_stream(
                cancel,
                app,
                job_id,
                agent,
                transcript.clone(),
            )
            .await
            {
                Ok(v) => v,
                Err(e) if is_not_chat_model_error(&e) => {
                    return Err(not_chat_model_message(profile.model.trim()));
                }
                Err(e) => return Err(e),
            }
        }
        AiProviderKind::Openrouter => {
            let key = require_key(api_key)?;
            let client = if let Some(base_url) = custom_base_url.as_deref() {
                openrouter::Client::builder(key)
                    .with_client(http_client.clone())
                    .base_url(base_url)
                    .build()
            } else {
                openrouter::Client::builder(key)
                    .with_client(http_client.clone())
                    .build()
            };
            let mut agent = client.agent(profile.model.trim());
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            let agent = if matches!(mode, AiAssistantMode::Create) {
                with_tools(agent.preamble(&effective_system), &tools).build()
            } else {
                agent.preamble(&effective_system).build()
            };
            run_stream(
                cancel,
                app,
                job_id,
                agent,
                transcript,
            )
            .await?
        }
        AiProviderKind::Anthropic => {
            let key = require_key(api_key)?;
            let client = if let Some(base_url) = custom_base_url.as_deref() {
                anthropic::Client::builder(key)
                    .with_client(http_client.clone())
                    .base_url(base_url)
                    .build()
                    .map_err(|e| e.to_string())?
            } else {
                anthropic::Client::builder(key)
                    .with_client(http_client.clone())
                    .build()
                    .map_err(|e| e.to_string())?
            };
            let mut agent = client.agent(profile.model.trim());
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            let agent = if matches!(mode, AiAssistantMode::Create) {
                with_tools(agent.preamble(&effective_system), &tools).build()
            } else {
                agent.preamble(&effective_system).build()
            };
            run_stream(
                cancel,
                app,
                job_id,
                agent,
                transcript,
            )
            .await?
        }
        AiProviderKind::Gemini => {
            let key = require_key(api_key)?;
            let client = if let Some(base_url) = custom_base_url.as_deref() {
                gemini::Client::builder(key)
                    .with_client(http_client.clone())
                    .base_url(base_url)
                    .build()
                    .map_err(|e| e.to_string())?
            } else {
                gemini::Client::builder(key)
                    .with_client(http_client.clone())
                    .build()
                    .map_err(|e| e.to_string())?
            };
            let mut agent = client.agent(profile.model.trim());
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            let agent = if matches!(mode, AiAssistantMode::Create) {
                with_tools(agent.preamble(&effective_system), &tools).build()
            } else {
                agent.preamble(&effective_system).build()
            };
            run_stream(
                cancel,
                app,
                job_id,
                agent,
                transcript,
            )
            .await?
        }
        AiProviderKind::Ollama => {
            let base = custom_base_url
                .as_deref()
                .unwrap_or(default_base_url(&AiProviderKind::Ollama));
            let client = ollama::Client::builder()
                .with_client(http_client.clone())
                .base_url(base)
                .build();
            let mut agent = client.agent(profile.model.trim());
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            let agent = if matches!(mode, AiAssistantMode::Create) {
                with_tools(agent.preamble(&effective_system), &tools).build()
            } else {
                agent.preamble(&effective_system).build()
            };
            run_stream(
                cancel,
                app,
                job_id,
                agent,
                transcript,
            )
            .await?
        }
    };

    if cancelled {
        return Ok((String::new(), true, tool_events));
    }

    let _ = app.emit(
        "ai:status",
        AiStatusEvent {
            job_id: job_id.to_string(),
            status: "finalizing".to_string(),
            detail: None,
        },
    );
    Ok((full, false, tool_events))
}

pub async fn generate_chat_title_with_rig(
    profile: &AiProfile,
    api_key: Option<&str>,
    context: Option<&str>,
    messages: &[AiMessage],
    assistant_response: &str,
) -> Result<String, String> {
    let caps = capabilities(&profile.provider);
    let max_tokens = if caps.requires_max_tokens {
        Some(64)
    } else {
        None
    };
    let http_client = build_http_client(profile)?;
    let custom_base_url = profile
        .base_url
        .as_deref()
        .map(|_| parse_base_url(profile))
        .transpose()
        .map_err(|e| e.to_string())?
        .map(|u| u.to_string());

    let user_text = messages
        .iter()
        .find(|m| m.role == "user" && !m.content.trim().is_empty())
        .map(|m| m.content.trim())
        .unwrap_or_default();
    let context_trimmed = context.unwrap_or("").trim();
    let context_short = if context_trimmed.len() > 1200 {
        &context_trimmed[..1200]
    } else {
        context_trimmed
    };
    let assistant_short = if assistant_response.len() > 1000 {
        &assistant_response[..1000]
    } else {
        assistant_response
    };
    let prompt = format!(
        "User request:\n{user_text}\n\nContext:\n{context_short}\n\nAssistant response:\n{assistant_short}\n\nTitle:"
    );

    let title = match profile.provider {
        AiProviderKind::Openai => {
            let key = require_key(api_key)?;
            let client = if let Some(base_url) = custom_base_url.as_deref() {
                openai::Client::builder(key)
                    .with_client(http_client.clone())
                    .base_url(base_url)
                    .build()
            } else {
                openai::Client::builder(key)
                    .with_client(http_client.clone())
                    .build()
            };
            let model = client
                .completion_model(profile.model.trim())
                .completions_api();
            let mut agent = AgentBuilder::new(model);
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            match agent
                .preamble(TITLE_PREAMBLE)
                .build()
                .prompt(&prompt)
                .multi_turn(1)
                .await
            {
                Ok(v) => v.to_string(),
                Err(e) => {
                    let msg = e.to_string();
                    if is_not_chat_model_error(&msg) {
                        return Err(not_chat_model_message(profile.model.trim()));
                    }
                    return Err(msg);
                }
            }
        }
        AiProviderKind::OpenaiCompat => {
            let key = api_key.unwrap_or("").trim();
            let base = custom_base_url
                .as_deref()
                .unwrap_or(default_base_url(&AiProviderKind::OpenaiCompat));
            let client = openai::Client::builder(key)
                .with_client(http_client.clone())
                .base_url(base)
                .build();
            let model = client
                .completion_model(profile.model.trim())
                .completions_api();
            let mut agent = AgentBuilder::new(model);
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            match agent
                .preamble(TITLE_PREAMBLE)
                .build()
                .prompt(&prompt)
                .multi_turn(1)
                .await
            {
                Ok(v) => v.to_string(),
                Err(e) => {
                    let msg = e.to_string();
                    if is_not_chat_model_error(&msg) {
                        return Err(not_chat_model_message(profile.model.trim()));
                    }
                    return Err(msg);
                }
            }
        }
        AiProviderKind::Openrouter => {
            let key = require_key(api_key)?;
            let client = if let Some(base_url) = custom_base_url.as_deref() {
                openrouter::Client::builder(key)
                    .with_client(http_client.clone())
                    .base_url(base_url)
                    .build()
            } else {
                openrouter::Client::builder(key)
                    .with_client(http_client.clone())
                    .build()
            };
            let mut agent = client.agent(profile.model.trim());
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            agent
                .preamble(TITLE_PREAMBLE)
                .build()
                .prompt(prompt)
                .multi_turn(1)
                .await
                .map_err(|e| e.to_string())?
                .to_string()
        }
        AiProviderKind::Anthropic => {
            let key = require_key(api_key)?;
            let client = if let Some(base_url) = custom_base_url.as_deref() {
                anthropic::Client::builder(key)
                    .with_client(http_client.clone())
                    .base_url(base_url)
                    .build()
                    .map_err(|e| e.to_string())?
            } else {
                anthropic::Client::builder(key)
                    .with_client(http_client.clone())
                    .build()
                    .map_err(|e| e.to_string())?
            };
            let mut agent = client.agent(profile.model.trim());
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            agent
                .preamble(TITLE_PREAMBLE)
                .build()
                .prompt(prompt)
                .multi_turn(1)
                .await
                .map_err(|e| e.to_string())?
                .to_string()
        }
        AiProviderKind::Gemini => {
            let key = require_key(api_key)?;
            let client = if let Some(base_url) = custom_base_url.as_deref() {
                gemini::Client::builder(key)
                    .with_client(http_client.clone())
                    .base_url(base_url)
                    .build()
                    .map_err(|e| e.to_string())?
            } else {
                gemini::Client::builder(key)
                    .with_client(http_client.clone())
                    .build()
                    .map_err(|e| e.to_string())?
            };
            let mut agent = client.agent(profile.model.trim());
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            agent
                .preamble(TITLE_PREAMBLE)
                .build()
                .prompt(prompt)
                .multi_turn(1)
                .await
                .map_err(|e| e.to_string())?
                .to_string()
        }
        AiProviderKind::Ollama => {
            let base = custom_base_url
                .as_deref()
                .unwrap_or(default_base_url(&AiProviderKind::Ollama));
            let client = ollama::Client::builder()
                .with_client(http_client.clone())
                .base_url(base)
                .build();
            let mut agent = client.agent(profile.model.trim());
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            agent
                .preamble(TITLE_PREAMBLE)
                .build()
                .prompt(prompt)
                .multi_turn(1)
                .await
                .map_err(|e| e.to_string())?
                .to_string()
        }
    };

    let line = title
        .lines()
        .find(|l| !l.trim().is_empty())
        .map(str::trim)
        .unwrap_or("Untitled Chat");
    let line = line.trim_matches('"').trim_matches('`').to_string();
    Ok(if line.len() > 80 {
        line[..80].trim().to_string()
    } else {
        line
    })
}

fn build_http_client(profile: &AiProfile) -> Result<reqwest::Client, String> {
    let mut headers = HeaderMap::new();
    for h in &profile.headers {
        let key = h.key.trim();
        if key.is_empty() {
            continue;
        }
        let name = HeaderName::from_bytes(key.as_bytes()).map_err(|e| e.to_string())?;
        let value = HeaderValue::from_str(&h.value).map_err(|e| e.to_string())?;
        headers.insert(name, value);
    }
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .user_agent("Glyph/0.1 (ai)")
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())
}

fn require_key(api_key: Option<&str>) -> Result<&str, String> {
    let key = api_key.unwrap_or("").trim();
    if key.is_empty() {
        return Err("API key not set for this profile".to_string());
    }
    Ok(key)
}

fn with_tools<M>(builder: AgentBuilder<M>, tools: &ToolBundle) -> AgentBuilderSimple<M>
where
    M: rig::completion::CompletionModel,
{
    builder
        .tool(tools.list_dir.clone())
        .tool(tools.search.clone())
        .tool(tools.stat.clone())
        .tool(tools.read_file.clone())
        .tool(tools.read_files_batch.clone())
        .tool(tools.write_file.clone())
        .tool(tools.apply_patch.clone())
        .tool(tools.move_path.clone())
        .tool(tools.mkdir.clone())
        .tool(tools.delete.clone())
}

async fn run_stream<M>(
    cancel: &CancellationToken,
    app: &AppHandle,
    job_id: &str,
    agent: Agent<M>,
    prompt: String,
) -> Result<(String, Vec<AiStoredToolEvent>, bool), String>
where
    M: rig::completion::CompletionModel + 'static,
    <M as rig::completion::CompletionModel>::StreamingResponse: rig::wasm_compat::WasmCompatSend,
{
    const MAX_TOOL_EVENTS: usize = 10;
    let mut stream = agent.stream_prompt(prompt).multi_turn(4).await;
    let mut full = String::new();
    let mut tool_events = Vec::<AiStoredToolEvent>::new();
    let mut tool_name_by_id = HashMap::<String, String>::new();
    while let Some(item) = stream.next().await {
        if cancel.is_cancelled() {
            return Ok((String::new(), tool_events, true));
        }
        let item = item.map_err(|e| e.to_string())?;
        match item {
            MultiTurnStreamItem::StreamAssistantItem(StreamedAssistantContent::Text(text)) => {
                full.push_str(&text.text);
                let _ = app.emit(
                    "ai:chunk",
                    AiChunkEvent {
                        job_id: job_id.to_string(),
                        delta: text.text,
                    },
                );
            }
            MultiTurnStreamItem::StreamAssistantItem(StreamedAssistantContent::ToolCall(call)) => {
                let _ = app.emit(
                    "ai:status",
                    AiStatusEvent {
                        job_id: job_id.to_string(),
                        status: "tool_call".to_string(),
                        detail: Some(call.function.name.clone()),
                    },
                );
                tool_events.push(emit_tool(
                    app,
                    job_id,
                    &call.function.name,
                    "call",
                    call.call_id.clone().or_else(|| Some(call.id.clone())),
                    Some(serde_json::json!({
                        "id": call.id,
                        "arguments": call.function.arguments
                    })),
                    None,
                ));
                if tool_events.len() >= MAX_TOOL_EVENTS {
                    return Err(
                        "tool loop detected; stopping after too many tool calls".to_string()
                    );
                }
                tool_name_by_id.insert(
                    call.call_id.clone().unwrap_or_else(|| call.id.clone()),
                    call.function.name,
                );
            }
            MultiTurnStreamItem::StreamUserItem(StreamedUserContent::ToolResult(result)) => {
                let tool_output = tool_result_text(&result.content);
                let phase = if is_tool_error_payload(&tool_output) {
                    "error"
                } else {
                    "result"
                };
                let _ = app.emit(
                    "ai:status",
                    AiStatusEvent {
                        job_id: job_id.to_string(),
                        status: "tool_result".to_string(),
                        detail: Some(result.id.clone()),
                    },
                );
                tool_events.push(emit_tool(
                    app,
                    job_id,
                    tool_name_by_id
                        .get(&result.call_id.clone().unwrap_or_else(|| result.id.clone()))
                        .map(String::as_str)
                        .unwrap_or("tool"),
                    phase,
                    result.call_id.clone().or_else(|| Some(result.id.clone())),
                    Some(serde_json::json!({
                        "id": result.id,
                        "content": tool_output
                    })),
                    if phase == "error" {
                        Some(tool_output)
                    } else {
                        None
                    },
                ));
                if tool_events.len() >= MAX_TOOL_EVENTS {
                    return Err(
                        "tool loop detected; stopping after too many tool calls".to_string()
                    );
                }
            }
            MultiTurnStreamItem::StreamAssistantItem(StreamedAssistantContent::Reasoning(
                reasoning,
            )) => {
                let delta = reasoning.reasoning.join("");
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
            MultiTurnStreamItem::FinalResponse(final_response) => {
                let response = final_response.response().trim();
                if !response.is_empty() && response != full.trim() {
                    // Ensure we emit any missing tail text from final response.
                    let tail = response
                        .strip_prefix(full.trim())
                        .unwrap_or(response)
                        .to_string();
                    if !tail.trim().is_empty() {
                        full.push_str(&tail);
                        let _ = app.emit(
                            "ai:chunk",
                            AiChunkEvent {
                                job_id: job_id.to_string(),
                                delta: tail,
                            },
                        );
                    }
                }
            }
            _ => {}
        }
    }
    Ok((full, tool_events, false))
}

fn tool_result_text(content: &rig::OneOrMany<ToolResultContent>) -> String {
    let mut out = String::new();
    for item in content.iter() {
        if let ToolResultContent::Text(text) = item {
            if !out.is_empty() {
                out.push('\n');
            }
            out.push_str(&text.text);
        }
    }
    out
}

fn is_tool_error_payload(payload: &str) -> bool {
    let trimmed = payload.trim();
    if trimmed.is_empty() {
        return false;
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
        return v.get("ok").and_then(|x| x.as_bool()) == Some(false)
            || v.get("error").and_then(|x| x.as_str()).is_some();
    }
    false
}

fn emit_tool(
    app: &AppHandle,
    job_id: &str,
    tool: &str,
    phase: &str,
    call_id: Option<String>,
    payload: Option<serde_json::Value>,
    error: Option<String>,
) -> AiStoredToolEvent {
    let at_ms = crate::ai_rig::helpers::now_ms();
    let _ = app.emit(
        "ai:tool",
        crate::ai_rig::types::AiToolEvent {
            job_id: job_id.to_string(),
            tool: tool.to_string(),
            phase: phase.to_string(),
            at_ms,
            call_id: call_id.clone(),
            payload: payload.clone(),
            error: error.clone(),
        },
    );
    AiStoredToolEvent {
        tool: tool.to_string(),
        phase: phase.to_string(),
        at_ms,
        call_id,
        payload,
        error,
    }
}
