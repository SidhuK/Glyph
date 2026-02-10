use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

use crate::{io_atomic, vault::VaultState};

use super::agent;
use super::audit::{audit_log_path, write_audit_log};
use super::helpers::{http_client, parse_base_url, split_system_and_messages};
use super::history;
use super::local_secrets;
use super::state::AiState;
use super::store::{ensure_default_profiles, read_store, store_path, write_store};
use super::types::{
    AiChatRequest, AiChatStartResult, AiDoneEvent, AiErrorEvent, AiProfile,
};

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

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_audit_mark(
    vault_state: State<'_, VaultState>,
    job_id: String,
    outcome: String,
) -> Result<(), String> {
    let _ =
        uuid::Uuid::parse_str(&job_id).map_err(|_| "invalid job_id".to_string())?;
    let root = vault_state.current_root()?;
    let path = audit_log_path(&root, &job_id)?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mut v: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
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
}

#[tauri::command]
pub async fn ai_chat_start(
    ai_state: State<'_, AiState>,
    vault_state: State<'_, VaultState>,
    app: AppHandle,
    mut request: AiChatRequest,
) -> Result<AiChatStartResult, String> {
    let job_id = uuid::Uuid::new_v4().to_string();
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
        let client = match http_client().await {
            Ok(c) => c,
            Err(e) => {
                let _ = app_for_task.emit(
                    "ai:error",
                    AiErrorEvent {
                        job_id: job_id_for_task.clone(),
                        message: e,
                    },
                );
                ai_state_for_task.finish(&job_id_for_task);
                return;
            }
        };

        let api_key = vault_root
            .as_deref()
            .and_then(|root| local_secrets::secret_get(root, &profile.id).ok().flatten());
        let (system, messages) =
            split_system_and_messages(request.messages.clone(), request.context.clone());

        let result = agent::run_agent_loop(
            &client,
            &cancel,
            &app_for_task,
            &job_id_for_task,
            &profile,
            api_key.as_deref(),
            &system,
            &messages,
            vault_root.as_deref(),
        )
        .await;

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
                    write_audit_log(
                        &root,
                        &job_id_for_task,
                        &profile,
                        &request,
                        &full,
                        cancelled,
                        &tool_events,
                    );
                }
                if !cancelled {
                    let _ = app_for_task
                        .notification()
                        .builder()
                        .title("Lattice")
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
                    .title("Lattice")
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
