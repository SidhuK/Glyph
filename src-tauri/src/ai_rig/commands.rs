use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tracing::warn;

use crate::space::SpaceState;

use super::audit::{write_audit_log, AuditLogParams};
use super::helpers::{http_client, parse_base_url, split_system_and_messages};
use super::history;
use super::local_secrets;
use super::runtime;
use super::state::AiState;
use super::store::{
    ensure_default_profiles, read_store, store_path_for_space, write_store, AiStore,
};
use super::types::{
    AiAssistantMode, AiChatRequest, AiChatStartResult, AiDoneEvent, AiErrorEvent, AiMessage,
    AiProfile, AiStoredToolEvent,
};
use serde::{Deserialize, Serialize};
use serde_json;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tokio_util::sync::CancellationToken;

const PROVIDER_SUPPORT_URL: &str =
    "https://raw.githubusercontent.com/BerriAI/litellm/refs/heads/main/provider_endpoints_support.json";
const PROVIDER_SUPPORT_CACHE_FILE: &str = "provider_endpoints_support.json";

fn is_transient_ai_error(message: &str) -> bool {
    let msg = message.to_lowercase();
    msg.contains("internal server error")
        || msg.contains("\"internal_error\"")
        || msg.contains("status code 500")
        || msg.contains("temporarily unavailable")
        || msg.contains("upstream")
        || msg.contains("timeout")
}

#[derive(Serialize, Deserialize)]
pub(crate) struct ProviderSupportEntry {
    display_name: String,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    endpoints: HashMap<String, bool>,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct ProviderSupportDocument {
    #[serde(default)]
    providers: HashMap<String, ProviderSupportEntry>,
}

async fn fetch_provider_support(cache_path: &PathBuf) -> Result<ProviderSupportDocument, String> {
    let client = http_client()?;
    let resp = client
        .get(PROVIDER_SUPPORT_URL)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("fetch failed ({})", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let doc: ProviderSupportDocument = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    let _ = fs::write(cache_path, &bytes);
    Ok(doc)
}

fn read_cached_provider_support(cache_path: &PathBuf) -> Option<ProviderSupportDocument> {
    fs::read(cache_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
}

fn provider_support_cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(PROVIDER_SUPPORT_CACHE_FILE))
}

pub fn refresh_provider_support_on_startup(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let cache_path = match provider_support_cache_path(&app) {
            Ok(path) => path,
            Err(err) => {
                warn!("provider support startup refresh skipped: {err}");
                return;
            }
        };
        if let Err(err) = fetch_provider_support(&cache_path).await {
            warn!("provider support startup refresh failed: {err}");
        }
    });
}

fn normalized_store_for_space(
    app: &AppHandle,
    space_root: Option<&std::path::Path>,
) -> Result<AiStore, String> {
    let path = store_path_for_space(app, space_root)?;
    let mut store = read_store(&path);
    ensure_default_profiles(&mut store);
    let _ = write_store(&path, &store);
    Ok(store)
}

fn emit_profiles_updated(app: &AppHandle) {
    let _ = app.emit("ai:profiles-updated", ());
}

fn ai_space_root(space_state: &SpaceState, window: &WebviewWindow) -> Result<PathBuf, String> {
    space_state
        .root_for_window(window)
        .map_err(|_| "Open a space to manage AI settings".to_string())
}

#[tauri::command]
pub async fn ai_profiles_list(
    app: AppHandle,
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
) -> Result<Vec<AiProfile>, String> {
    let space_root = ai_space_root(&space_state, &window)?;
    let store = normalized_store_for_space(&app, Some(&space_root))?;
    Ok(store.profiles)
}

#[tauri::command]
pub async fn ai_active_profile_get(
    app: AppHandle,
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
) -> Result<Option<String>, String> {
    let space_root = ai_space_root(&space_state, &window)?;
    let store = normalized_store_for_space(&app, Some(&space_root))?;
    Ok(store
        .active_profile_id
        .or_else(|| store.profiles.first().map(|p| p.id.clone())))
}

#[tauri::command]
pub async fn ai_active_profile_set(
    app: AppHandle,
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    id: Option<String>,
) -> Result<(), String> {
    let space_root = ai_space_root(&space_state, &window)?;
    let path = store_path_for_space(&app, Some(&space_root))?;
    let mut store = normalized_store_for_space(&app, Some(&space_root))?;
    store.active_profile_id = id.filter(|candidate| {
        store
            .profiles
            .iter()
            .any(|profile| profile.id == *candidate)
    });
    write_store(&path, &store)?;
    emit_profiles_updated(&app);
    Ok(())
}

#[tauri::command]
pub async fn ai_profile_upsert(
    app: AppHandle,
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    profile: AiProfile,
) -> Result<AiProfile, String> {
    let space_root = ai_space_root(&space_state, &window)?;
    let path = store_path_for_space(&app, Some(&space_root))?;
    let mut store = normalized_store_for_space(&app, Some(&space_root))?;

    let mut next = profile;
    next.id = next.provider.key().to_string();
    next.name = next.provider.display_name().to_string();

    let _ = parse_base_url(&next)?;

    let mut replaced = false;
    for p in &mut store.profiles {
        if p.provider.key() == next.provider.key() {
            *p = next.clone();
            replaced = true;
            break;
        }
    }
    if !replaced {
        store.profiles.push(next.clone());
    }
    if store.active_profile_id.is_none() {
        store.active_profile_id = Some(next.id.clone());
    }
    write_store(&path, &store)?;
    emit_profiles_updated(&app);
    Ok(next)
}

#[tauri::command]
pub async fn ai_profile_delete(
    app: AppHandle,
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    id: String,
) -> Result<(), String> {
    let space_root = ai_space_root(&space_state, &window)?;
    let path = store_path_for_space(&app, Some(&space_root))?;
    let mut store = normalized_store_for_space(&app, Some(&space_root))?;
    let _ = local_secrets::secret_clear(&space_root, &id);
    if let Some(profile) = store.profiles.iter_mut().find(|profile| profile.id == id) {
        profile.model.clear();
        profile.base_url = None;
        profile.headers.clear();
        profile.reasoning_effort = None;
        profile.allow_private_hosts = matches!(
            profile.provider,
            super::types::AiProviderKind::Ollama
                | super::types::AiProviderKind::LlamaCpp
                | super::types::AiProviderKind::Amp
                | super::types::AiProviderKind::ClaudeCode
                | super::types::AiProviderKind::Opencode
                | super::types::AiProviderKind::Pi
        );
    }
    ensure_default_profiles(&mut store);
    write_store(&path, &store)?;
    emit_profiles_updated(&app);
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_secret_set(
    app: AppHandle,
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    profile_id: String,
    api_key: String,
) -> Result<(), String> {
    let root = space_state
        .root_for_window(&window)
        .map_err(|_| "Open a space to store API keys locally".to_string())?;
    let _ = normalized_store_for_space(&app, Some(&root))?;
    local_secrets::secret_set(&root, &profile_id, api_key.trim())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_secret_clear(
    app: AppHandle,
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    profile_id: String,
) -> Result<(), String> {
    let root = space_state
        .root_for_window(&window)
        .map_err(|_| "Open a space to manage API keys".to_string())?;
    let _ = normalized_store_for_space(&app, Some(&root))?;
    local_secrets::secret_clear(&root, &profile_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_secret_status(
    app: AppHandle,
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    profile_id: String,
) -> Result<bool, String> {
    let root = match space_state.root_for_window(&window) {
        Ok(root) => root,
        Err(_) => return Ok(false),
    };
    let _ = normalized_store_for_space(&app, Some(&root))?;
    local_secrets::secret_status(&root, &profile_id)
}

#[tauri::command]
pub async fn ai_secret_list(
    app: AppHandle,
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
) -> Result<Vec<String>, String> {
    let root = space_state
        .root_for_window(&window)
        .map_err(|_| "Open a space to manage API keys".to_string())?;
    let _ = normalized_store_for_space(&app, Some(&root))?;
    local_secrets::secret_ids(&root)
}

#[tauri::command]
pub async fn ai_provider_support(app: AppHandle) -> Result<ProviderSupportDocument, String> {
    let cache_path = provider_support_cache_path(&app)?;
    match fetch_provider_support(&cache_path).await {
        Ok(doc) => Ok(doc),
        Err(fetch_err) => {
            if let Some(cached) = read_cached_provider_support(&cache_path) {
                return Ok(cached);
            }
            Err(format!(
                "provider metadata unavailable ({fetch_err}); no cached provider data found"
            ))
        }
    }
}

#[tauri::command]
pub async fn ai_chat_start(
    ai_state: State<'_, AiState>,
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    app: AppHandle,
    mut request: AiChatRequest,
) -> Result<AiChatStartResult, String> {
    let job_id = uuid::Uuid::new_v4().to_string();
    let history_id = request
        .thread_id
        .as_deref()
        .and_then(|id| {
            let trimmed = id.trim();
            if trimmed.is_empty() {
                None
            } else if uuid::Uuid::parse_str(trimmed).is_ok() {
                Some(trimmed.to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| job_id.clone());
    let cancel = ai_state.register(&job_id);

    if !request.audit {
        request.audit = true;
    }

    let space_root = ai_space_root(&space_state, &window)?;
    let store = normalized_store_for_space(&app, Some(&space_root))?;

    let profile = store
        .profiles
        .iter()
        .find(|p| p.id == request.profile_id)
        .cloned()
        .ok_or_else(|| "unknown profile".to_string())?;
    if profile.model.trim().is_empty()
        && !matches!(
            profile.provider,
            super::types::AiProviderKind::CodexChatgpt
                | super::types::AiProviderKind::Amp
                | super::types::AiProviderKind::ClaudeCode
                | super::types::AiProviderKind::Opencode
                | super::types::AiProviderKind::Pi
        )
    {
        return Err("Model not set for this profile".to_string());
    }

    let app_for_task = app.clone();
    let job_id_for_task = job_id.clone();

    tauri::async_runtime::spawn(async move {
        let ai_state_for_task = app_for_task.state::<AiState>();
        let codex_state = app_for_task.state::<crate::ai_codex::state::CodexState>();

        let api_key = local_secrets::secret_get(&space_root, &profile.id)
            .ok()
            .flatten();
        let (system, messages) =
            split_system_and_messages(request.messages.clone(), request.context.clone());

        let mut result = run_request(
            &cancel,
            codex_state.clone(),
            &app_for_task,
            &job_id_for_task,
            &profile,
            api_key.as_deref(),
            &system,
            &messages,
            &request.mode,
            Some(space_root.as_path()),
            request.thread_id.as_deref(),
        )
        .await;
        if let Err(message) = &result {
            if !cancel.is_cancelled() && is_transient_ai_error(message) {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                result = run_request(
                    &cancel,
                    codex_state.clone(),
                    &app_for_task,
                    &job_id_for_task,
                    &profile,
                    api_key.as_deref(),
                    &system,
                    &messages,
                    &request.mode,
                    Some(space_root.as_path()),
                    request.thread_id.as_deref(),
                )
                .await;
            }
        }

        match result {
            Ok((full, cancelled, tool_events)) => {
                let _ = app_for_task.emit(
                    "ai:done",
                    AiDoneEvent {
                        job_id: job_id_for_task.clone(),
                        cancelled,
                    },
                );
                let title = runtime::generate_chat_title_with_rig(
                    &profile,
                    api_key.as_deref(),
                    request.context.as_deref(),
                    &request.messages,
                    &full,
                )
                .await
                .ok();
                write_audit_log(&AuditLogParams {
                    space_root: &space_root,
                    job_id: &job_id_for_task,
                    history_id: &history_id,
                    profile: &profile,
                    request: &request,
                    response: &full,
                    title: title.as_deref(),
                    cancelled,
                    tool_events: &tool_events,
                });
                ai_state_for_task.finish(&job_id_for_task);
            }
            Err(message) => {
                let _ = app_for_task.emit(
                    "ai:error",
                    AiErrorEvent {
                        job_id: job_id_for_task.clone(),
                        message,
                    },
                );
                ai_state_for_task.finish(&job_id_for_task);
            }
        }
    });

    Ok(AiChatStartResult { job_id })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_chat_cancel(ai_state: State<'_, AiState>, job_id: String) -> Result<(), String> {
    ai_state.cancel(&job_id);
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_chat_history_list(
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    limit: Option<u32>,
) -> Result<Vec<history::AiChatHistorySummary>, String> {
    history::ai_chat_history_list(window, space_state, limit).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_chat_history_get(
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    job_id: String,
) -> Result<history::AiChatHistoryDetail, String> {
    history::ai_chat_history_get(window, space_state, job_id).await
}

#[allow(clippy::too_many_arguments)]
pub async fn run_request(
    cancel: &CancellationToken,
    codex_state: State<'_, crate::ai_codex::state::CodexState>,
    app: &AppHandle,
    job_id: &str,
    profile: &AiProfile,
    api_key: Option<&str>,
    system: &str,
    messages: &[AiMessage],
    mode: &AiAssistantMode,
    space_root: Option<&std::path::Path>,
    thread_id: Option<&str>,
) -> Result<(String, bool, Vec<AiStoredToolEvent>), String> {
    if matches!(profile.provider, super::types::AiProviderKind::CodexChatgpt) {
        return crate::ai_codex::chat::run_with_codex(
            codex_state,
            cancel,
            app,
            job_id,
            profile,
            system,
            messages,
            mode,
            space_root,
            thread_id,
        )
        .await;
    }
    if matches!(profile.provider, super::types::AiProviderKind::Opencode) {
        return crate::ai_opencode::run_with_opencode(
            cancel, app, job_id, profile, system, messages, mode, space_root,
        )
        .await;
    }
    if matches!(profile.provider, super::types::AiProviderKind::Amp) {
        return crate::ai_amp::run_with_amp(
            cancel, app, job_id, profile, system, messages, mode, space_root,
        )
        .await;
    }
    if matches!(profile.provider, super::types::AiProviderKind::ClaudeCode) {
        return crate::ai_claude_code::run_with_claude_code(
            cancel, app, job_id, profile, system, messages, mode, space_root,
        )
        .await;
    }
    if matches!(profile.provider, super::types::AiProviderKind::Pi) {
        return crate::ai_pi::run_with_pi(
            cancel, app, job_id, profile, system, messages, mode, space_root,
        )
        .await;
    }

    runtime::run_with_rig(
        cancel, app, job_id, profile, api_key, system, messages, mode, space_root,
    )
    .await
}
