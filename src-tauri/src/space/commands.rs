use std::path::{Path, PathBuf};
use tauri::State;

use crate::{
    index::{self, db::reset_schema_cache},
    paths,
};

use super::helpers::{
    canonicalize_dir, create_or_open_impl, ensure_onboarding_note_for_command, SpaceInfo,
};
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
    let _ = set_notes_watcher(&state, app.clone(), PathBuf::from(&info.root));
    let _ = crate::set_space_close_menu_enabled(&app, true);
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
    let _ = set_notes_watcher(&state, app.clone(), PathBuf::from(&info.root));
    let _ = crate::set_space_close_menu_enabled(&app, true);
    Ok(info)
}

#[tauri::command]
pub fn space_get_current(state: State<'_, SpaceState>) -> Option<String> {
    let guard = state.current.lock().ok()?;
    guard.as_ref().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn space_show_onboarding_note(state: State<'_, SpaceState>) -> Result<String, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let note_path = ensure_onboarding_note_for_command(&root)?;
        let abs = paths::join_under(&root, Path::new(&note_path))?;
        if let Ok(markdown) = std::fs::read_to_string(&abs) {
            let _ = index::index_note(&root, &note_path, &markdown);
        }
        Ok(note_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn space_close(app: tauri::AppHandle, state: State<'_, SpaceState>) -> Result<(), String> {
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
    let _ = crate::set_space_close_menu_enabled(&app, false);
    Ok(())
}
