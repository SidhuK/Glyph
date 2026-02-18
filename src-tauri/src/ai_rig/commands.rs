use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;
use tracing::warn;

use crate::{io_atomic, vault::VaultState};

use super::audit::{audit_log_path, write_audit_log};
use super::helpers::{http_client, parse_base_url, split_system_and_messages};
use super::history;
use super::local_secrets;
use super::runtime;
use super::state::AiState;
use super::store::{ensure_default_profiles, read_store, store_path, write_store};
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
    endpoints: HashMap<String, bool>,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct ProviderSupportDocument {
    #[serde(default)]
    providers: HashMap<String, ProviderSupportEntry>,
}

async fn fetch_provider_support(cache_path: &PathBuf) -> Result<ProviderSupportDocument, String> {
    let client = http_client().await?;
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

#[tauri::command]
pub async fn ai_profiles_list(app: AppHandle) -> Result<Vec<AiProfile>, String> {
    let path = store_path(&app)?;
    let mut store = read_store(&path);
    ensure_default_profiles(&mut store);
    let _ = write_store(&path, &store);
    Ok(store.profiles)
}

#[tauri::command]
pub async fn ai_active_profile_get(app: AppHandle) -> Result<Option<String>, String> {
    let path = store_path(&app)?;
    let mut store = read_store(&path);
    ensure_default_profiles(&mut store);
    let _ = write_store(&path, &store);
    Ok(store
        .active_profile_id
        .or_else(|| store.profiles.first().map(|p| p.id.clone())))
}

#[tauri::command]
pub async fn ai_active_profile_set(app: AppHandle, id: Option<String>) -> Result<(), String> {
    let path = store_path(&app)?;
    let mut store = read_store(&path);
    ensure_default_profiles(&mut store);
    store.active_profile_id = id;
    write_store(&path, &store)
}

#[tauri::command]
pub async fn ai_profile_upsert(app: AppHandle, profile: AiProfile) -> Result<AiProfile, String> {
    let path = store_path(&app)?;
    let mut store = read_store(&path);
    ensure_default_profiles(&mut store);

    let mut next = profile;
    if next.id.trim().is_empty() {
        next.id = uuid::Uuid::new_v4().to_string();
    }
    if next.name.trim().is_empty() {
        next.name = "AI Profile".to_string();
    }

    let _ = parse_base_url(&next)?;

    let mut replaced = false;
    for p in &mut store.profiles {
        if p.id == next.id {
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
    Ok(next)
}

#[tauri::command]
pub async fn ai_profile_delete(
    app: AppHandle,
    vault_state: State<'_, VaultState>,
    id: String,
) -> Result<(), String> {
    let path = store_path(&app)?;
    let mut store = read_store(&path);
    store.profiles.retain(|p| p.id != id);
    if let Ok(root) = vault_state.current_root() {
        let _ = local_secrets::secret_clear(&root, &id);
    }
    if store.active_profile_id.as_deref() == Some(&id) {
        store.active_profile_id = store.profiles.first().map(|p| p.id.clone());
    }
    write_store(&path, &store)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_secret_set(
    vault_state: State<'_, VaultState>,
    profile_id: String,
    api_key: String,
) -> Result<(), String> {
    let root = vault_state
        .current_root()
        .map_err(|_| "Open a vault to store API keys locally".to_string())?;
    local_secrets::secret_set(&root, &profile_id, api_key.trim())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_secret_clear(
    vault_state: State<'_, VaultState>,
    profile_id: String,
) -> Result<(), String> {
    let root = vault_state
        .current_root()
        .map_err(|_| "Open a vault to manage API keys".to_string())?;
    local_secrets::secret_clear(&root, &profile_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_secret_status(
    vault_state: State<'_, VaultState>,
    profile_id: String,
) -> Result<bool, String> {
    let root = match vault_state.current_root() {
        Ok(root) => root,
        Err(_) => return Ok(false),
    };
    local_secrets::secret_status(&root, &profile_id)
}

#[tauri::command]
pub async fn ai_secret_list(vault_state: State<'_, VaultState>) -> Result<Vec<String>, String> {
    let root = vault_state
        .current_root()
        .map_err(|_| "Open a vault to manage API keys".to_string())?;
    local_secrets::secret_ids(&root)
}

#[tauri::command]
pub async fn ai_provider_support(
    app: AppHandle,
) -> Result<ProviderSupportDocument, String> {
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

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_audit_mark(
    vault_state: State<'_, VaultState>,
    job_id: String,
    outcome: String,
) -> Result<(), String> {
    let _ = uuid::Uuid::parse_str(&job_id).map_err(|_| "invalid job_id".to_string())?;
    let root = vault_state.current_root()?;
    let path = audit_log_path(&root, &job_id)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        let mut v: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if let Some(obj) = v.as_object_mut() {
            let out = outcome.trim();
            let out = if out.len() > 200 { &out[..200] } else { out };
            obj.insert(
                "outcome".to_string(),
                serde_json::Value::String(out.to_string()),
            );
        }
        let out = serde_json::to_vec_pretty(&v).map_err(|e| e.to_string())?;
        io_atomic::write_atomic(&path, &out).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ai_chat_start(
    ai_state: State<'_, AiState>,
    vault_state: State<'_, VaultState>,
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

    let store_path = store_path(&app)?;
    let mut store = read_store(&store_path);
    ensure_default_profiles(&mut store);
    let vault_root = vault_state.current_root().ok();
    let _ = write_store(&store_path, &store);

    let profile = store
        .profiles
        .iter()
        .find(|p| p.id == request.profile_id)
        .cloned()
        .ok_or_else(|| "unknown profile".to_string())?;
    if profile.model.trim().is_empty() {
        return Err("Model not set for this profile".to_string());
    }

    let app_for_task = app.clone();
    let job_id_for_task = job_id.clone();

    tauri::async_runtime::spawn(async move {
        let ai_state_for_task = app_for_task.state::<AiState>();

        let api_key = vault_root
            .as_deref()
            .and_then(|root| local_secrets::secret_get(root, &profile.id).ok().flatten());
        let (system, messages) =
            split_system_and_messages(request.messages.clone(), request.context.clone());

        let mut result = run_request(
            &cancel,
            &app_for_task,
            &job_id_for_task,
            &profile,
            api_key.as_deref(),
            &system,
            &messages,
            &request.mode,
            vault_root.as_deref(),
        )
        .await;
        if let Err(message) = &result {
            if !cancel.is_cancelled() && is_transient_ai_error(message) {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                result = run_request(
                    &cancel,
                    &app_for_task,
                    &job_id_for_task,
                    &profile,
                    api_key.as_deref(),
                    &system,
                    &messages,
                    &request.mode,
                    vault_root.as_deref(),
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
                if let Some(root) = vault_root {
                    let title = runtime::generate_chat_title_with_rig(
                        &profile,
                        api_key.as_deref(),
                        request.context.as_deref(),
                        &request.messages,
                        &full,
                    )
                    .await
                    .ok();
                    write_audit_log(
                        &root,
                        &job_id_for_task,
                        &history_id,
                        &profile,
                        &request,
                        &full,
                        title.as_deref(),
                        cancelled,
                        &tool_events,
                    );
                }
                if !cancelled {
                    let _ = app_for_task
                        .notification()
                        .builder()
                        .title("Glyph")
                        .body("AI response ready")
                        .show();
                }
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
                let _ = app_for_task
                    .notification()
                    .builder()
                    .title("Glyph")
                    .body("AI request failed")
                    .show();
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
    vault_state: State<'_, VaultState>,
    limit: Option<u32>,
) -> Result<Vec<history::AiChatHistorySummary>, String> {
    history::ai_chat_history_list(vault_state, limit).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_chat_history_get(
    vault_state: State<'_, VaultState>,
    job_id: String,
) -> Result<history::AiChatHistoryDetail, String> {
    history::ai_chat_history_get(vault_state, job_id).await
}

pub async fn run_request(
    cancel: &CancellationToken,
    app: &AppHandle,
    job_id: &str,
    profile: &AiProfile,
    api_key: Option<&str>,
    system: &str,
    messages: &[AiMessage],
    mode: &AiAssistantMode,
    vault_root: Option<&std::path::Path>,
) -> Result<(String, bool, Vec<AiStoredToolEvent>), String> {
    runtime::run_with_rig(
        cancel, app, job_id, profile, api_key, system, messages, mode, vault_root,
    )
    .await
}
