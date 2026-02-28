use std::path::PathBuf;
use tauri::State;

use crate::index::db::reset_schema_cache;

use super::helpers::{canonicalize_dir, create_or_open_impl, SpaceInfo};
use super::state::SpaceState;
use super::watcher::set_notes_watcher;

#[tauri::command]
pub async fn space_create(
    app: tauri::AppHandle,
    state: State<'_, SpaceState>,
    path: String,
) -> Result<SpaceInfo, String> {
    let root = PathBuf::from(path);
    let info = tauri::async_runtime::spawn_blocking(move || -> Result<SpaceInfo, String> {
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let root = canonicalize_dir(&root)?;
        create_or_open_impl(&root)
    })
    .await
    .map_err(|e| e.to_string())??;

    reset_schema_cache();
    let mut guard = state
        .current
        .lock()
        .map_err(|_| "space state poisoned".to_string())?;
    *guard = Some(PathBuf::from(&info.root));
    drop(guard);
    let _ = set_notes_watcher(&state, app, PathBuf::from(&info.root));
    Ok(info)
}

#[tauri::command]
pub async fn space_open(
    app: tauri::AppHandle,
    state: State<'_, SpaceState>,
    path: String,
) -> Result<SpaceInfo, String> {
    let root = PathBuf::from(path);
    let info = tauri::async_runtime::spawn_blocking(move || -> Result<SpaceInfo, String> {
        let root = canonicalize_dir(&root)?;
        create_or_open_impl(&root)
    })
    .await
    .map_err(|e| e.to_string())??;

    reset_schema_cache();
    let mut guard = state
        .current
        .lock()
        .map_err(|_| "space state poisoned".to_string())?;
    *guard = Some(PathBuf::from(&info.root));
    drop(guard);
    let _ = set_notes_watcher(&state, app, PathBuf::from(&info.root));
    Ok(info)
}

#[tauri::command]
pub fn space_get_current(state: State<'_, SpaceState>) -> Option<String> {
    let guard = state.current.lock().ok()?;
    guard.as_ref().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn space_close(state: State<'_, SpaceState>) -> Result<(), String> {
    {
        let mut guard = state
            .current
            .lock()
            .map_err(|_| "space state poisoned".to_string())?;
        *guard = None;
    }
    let mut watcher_guard = state
        .notes_watcher
        .lock()
        .map_err(|_| "space watcher state poisoned".to_string())?;
    *watcher_guard = None;
    reset_schema_cache();
    Ok(())
}
