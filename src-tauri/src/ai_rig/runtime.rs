use std::path::Path;

use tauri::{AppHandle, Emitter};
use tokio::time::{sleep, Duration};
use tokio_util::sync::CancellationToken;

use rig::{
    agent::{Agent, AgentBuilder, AgentBuilderSimple},
    client::CompletionClient,
    completion::Prompt,
    providers::{anthropic, gemini, ollama, openai, openrouter},
};

use crate::ai::{
    helpers::default_base_url,
    types::{AiChunkEvent, AiMessage, AiProfile, AiProviderKind, AiStoredToolEvent},
};

use super::{
    events::AiStatusEvent,
    providers::{build_transcript, capabilities},
    tools::ToolBundle,
};

const FAKE_CHUNK_CHARS: usize = 48;
const FAKE_CHUNK_DELAY_MS: u64 = 12;

pub async fn run_with_rig(
    cancel: &CancellationToken,
    app: &AppHandle,
    job_id: &str,
    profile: &AiProfile,
    api_key: Option<&str>,
    system: &str,
    messages: &[AiMessage],
    vault_root: Option<&Path>,
) -> Result<(String, bool, Vec<AiStoredToolEvent>), String> {
    let root = vault_root.ok_or_else(|| "No vault is open".to_string())?;
    let transcript = build_transcript(system, messages);
    let tools = ToolBundle::new(root.to_path_buf());
    let caps = capabilities(&profile.provider);
    let max_tokens = if caps.requires_max_tokens {
        Some(2048)
    } else {
        None
    };

    let _ = app.emit(
        "ai:status",
        AiStatusEvent {
            job_id: job_id.to_string(),
            status: "thinking".to_string(),
            detail: None,
        },
    );

    let full = match profile.provider {
        AiProviderKind::Openai => {
            let key = require_key(api_key)?;
            let client = if let Some(base_url) = profile.base_url.as_deref() {
                openai::Client::builder(key).base_url(base_url).build()
            } else {
                openai::Client::new(key)
            };
            let mut agent = client.agent(profile.model.trim()).temperature(0.2);
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            run_prompt(with_tools(agent.preamble(system), &tools).build(), transcript).await?
        }
        AiProviderKind::OpenaiCompat => {
            let key = api_key.unwrap_or("").trim();
            let base = profile
                .base_url
                .as_deref()
                .unwrap_or(default_base_url(&AiProviderKind::OpenaiCompat));
            let client = openai::Client::builder(key).base_url(base).build();
            let mut agent = client.agent(profile.model.trim()).temperature(0.2);
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            run_prompt(with_tools(agent.preamble(system), &tools).build(), transcript).await?
        }
        AiProviderKind::Openrouter => {
            let key = require_key(api_key)?;
            let client = if let Some(base_url) = profile.base_url.as_deref() {
                openrouter::Client::builder(key).base_url(base_url).build()
            } else {
                openrouter::Client::new(key)
            };
            let mut agent = client.agent(profile.model.trim()).temperature(0.2);
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            run_prompt(with_tools(agent.preamble(system), &tools).build(), transcript).await?
        }
        AiProviderKind::Anthropic => {
            let key = require_key(api_key)?;
            let client = if let Some(base_url) = profile.base_url.as_deref() {
                anthropic::Client::builder(key)
                    .base_url(base_url)
                    .build()
                    .map_err(|e| e.to_string())?
            } else {
                anthropic::Client::new(key)
            };
            let mut agent = client.agent(profile.model.trim()).temperature(0.2);
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            run_prompt(with_tools(agent.preamble(system), &tools).build(), transcript).await?
        }
        AiProviderKind::Gemini => {
            let key = require_key(api_key)?;
            let client = if let Some(base_url) = profile.base_url.as_deref() {
                gemini::Client::builder(key)
                    .base_url(base_url)
                    .build()
                    .map_err(|e| e.to_string())?
            } else {
                gemini::Client::new(key)
            };
            let mut agent = client.agent(profile.model.trim()).temperature(0.2);
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            run_prompt(with_tools(agent.preamble(system), &tools).build(), transcript).await?
        }
        AiProviderKind::Ollama => {
            let base = profile
                .base_url
                .as_deref()
                .unwrap_or(default_base_url(&AiProviderKind::Ollama));
            let client = ollama::Client::builder().base_url(base).build();
            let mut agent = client.agent(profile.model.trim()).temperature(0.2);
            if let Some(v) = max_tokens {
                agent = agent.max_tokens(v);
            }
            run_prompt(with_tools(agent.preamble(system), &tools).build(), transcript).await?
        }
    };

    if cancel.is_cancelled() {
        return Ok((String::new(), true, Vec::new()));
    }

    emit_fake_chunks(cancel, app, job_id, &full).await;
    let _ = app.emit(
        "ai:status",
        AiStatusEvent {
            job_id: job_id.to_string(),
            status: "finalizing".to_string(),
            detail: None,
        },
    );
    Ok((full, false, Vec::new()))
}

fn require_key(api_key: Option<&str>) -> Result<&str, String> {
    let key = api_key.unwrap_or("").trim();
    if key.is_empty() {
        return Err("API key not set for this profile".to_string());
    }
    Ok(key)
}

fn with_tools<M>(
    builder: AgentBuilder<M>,
    tools: &ToolBundle,
) -> AgentBuilderSimple<M>
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

async fn run_prompt<M>(agent: Agent<M>, prompt: String) -> Result<String, String>
where
    M: rig::completion::CompletionModel,
{
    agent.prompt(prompt).await.map_err(|e| e.to_string())
}

async fn emit_fake_chunks(cancel: &CancellationToken, app: &AppHandle, job_id: &str, text: &str) {
    let mut chunk = String::new();
    let mut n = 0usize;
    for ch in text.chars() {
        if cancel.is_cancelled() {
            return;
        }
        chunk.push(ch);
        n += 1;
        if n >= FAKE_CHUNK_CHARS {
            let _ = app.emit(
                "ai:chunk",
                AiChunkEvent {
                    job_id: job_id.to_string(),
                    delta: chunk.clone(),
                },
            );
            chunk.clear();
            n = 0;
            sleep(Duration::from_millis(FAKE_CHUNK_DELAY_MS)).await;
        }
    }
    if !chunk.is_empty() {
        let _ = app.emit(
            "ai:chunk",
            AiChunkEvent {
                job_id: job_id.to_string(),
                delta: chunk,
            },
        );
    }
}
