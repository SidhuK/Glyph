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
use super::watcher::create_notes_watcher;

const MAIN_WINDOW_LABEL: &str = "main";

fn install_active_session(
    app: tauri::AppHandle,
    state: &SpaceState,
    root: PathBuf,
) -> Result<(), String> {
    let recent_local_changes = state.new_recent_local_changes();
    let watcher = create_notes_watcher(
        app,
        root.clone(),
        MAIN_WINDOW_LABEL.to_string(),
        recent_local_changes.clone(),
    )?;
    state.replace_session(root, watcher, recent_local_changes)
}

pub(crate) fn update_close_space_menu(app: &tauri::AppHandle, state: &SpaceState) {
    let _ = crate::set_space_close_menu_enabled(app, state.has_open_session());
}

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
    install_active_session(app.clone(), &state, PathBuf::from(&info.root))?;
    update_close_space_menu(&app, &state);
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
    install_active_session(app.clone(), &state, PathBuf::from(&info.root))?;
    update_close_space_menu(&app, &state);
    Ok(info)
}

#[tauri::command]
pub fn space_get_current(state: State<'_, SpaceState>) -> Option<String> {
    state
        .current_root()
        .ok()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn space_get_current_info(
    state: State<'_, SpaceState>,
) -> Result<Option<SpaceInfo>, String> {
    let Ok(root) = state.current_root() else {
        return Ok(None);
    };
    tauri::async_runtime::spawn_blocking(move || create_or_open_impl(&root).map(Some))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn space_show_onboarding_note(
    state: State<'_, SpaceState>,
) -> Result<String, String> {
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
pub fn space_close(
    app: tauri::AppHandle,
    state: State<'_, SpaceState>,
) -> Result<(), String> {
    state.clear_session()?;
    reset_schema_cache();
    update_close_space_menu(&app, &state);
    Ok(())
}
