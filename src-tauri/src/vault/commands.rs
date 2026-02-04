use std::path::PathBuf;
use tauri::State;

use super::helpers::{canonicalize_dir, create_or_open_impl, VaultInfo};
use super::state::VaultState;
use super::watcher::set_notes_watcher;

#[tauri::command]
pub async fn vault_create(
    app: tauri::AppHandle,
    state: State<'_, VaultState>,
    path: String,
) -> Result<VaultInfo, String> {
    let root = PathBuf::from(path);
    let info = tauri::async_runtime::spawn_blocking(move || -> Result<VaultInfo, String> {
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let root = canonicalize_dir(&root)?;
        create_or_open_impl(&root)
    })
    .await
    .map_err(|e| e.to_string())??;

    let mut guard = state
        .current
        .lock()
        .map_err(|_| "vault state poisoned".to_string())?;
    *guard = Some(PathBuf::from(&info.root));
    drop(guard);
    let _ = set_notes_watcher(&state, app, PathBuf::from(&info.root));
    Ok(info)
}

#[tauri::command]
pub async fn vault_open(
    app: tauri::AppHandle,
    state: State<'_, VaultState>,
    path: String,
) -> Result<VaultInfo, String> {
    let root = PathBuf::from(path);
    let info = tauri::async_runtime::spawn_blocking(move || -> Result<VaultInfo, String> {
        let root = canonicalize_dir(&root)?;
        create_or_open_impl(&root)
    })
    .await
    .map_err(|e| e.to_string())??;

    let mut guard = state
        .current
        .lock()
        .map_err(|_| "vault state poisoned".to_string())?;
    *guard = Some(PathBuf::from(&info.root));
    drop(guard);
    let _ = set_notes_watcher(&state, app, PathBuf::from(&info.root));
    Ok(info)
}

#[tauri::command]
pub fn vault_get_current(state: State<'_, VaultState>) -> Option<String> {
    let guard = state.current.lock().ok()?;
    guard.as_ref().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn vault_close(state: State<'_, VaultState>) -> Result<(), String> {
    {
        let mut guard = state
            .current
            .lock()
            .map_err(|_| "vault state poisoned".to_string())?;
        *guard = None;
    }
    let mut watcher_guard = state
        .notes_watcher
        .lock()
        .map_err(|_| "vault watcher state poisoned".to_string())?;
    *watcher_guard = None;
    Ok(())
}
