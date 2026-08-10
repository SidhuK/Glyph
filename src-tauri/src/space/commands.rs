use serde::Serialize;
use std::path::PathBuf;
use tauri::{Emitter, State};

use crate::{index::db::reset_schema_cache, window_geometry};

use super::helpers::{canonicalize_dir, create_or_open_impl, SpaceInfo};
use super::state::SpaceState;
use super::watcher::create_notes_watcher;

#[derive(Serialize)]
struct NoteChangeEvent {
    space_path: String,
    rel_path: String,
    removed: bool,
}

fn emit_welcome_note_created(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    info: &SpaceInfo,
    welcome_note_created: bool,
) {
    let Some(rel_path) = welcome_note_created
        .then(|| info.welcome_note_path.clone())
        .flatten()
    else {
        return;
    };
    let _ = app.emit_to(
        window.label(),
        "notes:external_changed",
        NoteChangeEvent {
            space_path: info.root.clone(),
            rel_path,
            removed: false,
        },
    );
}

fn install_window_session(
    app: tauri::AppHandle,
    state: &SpaceState,
    window_label: String,
    root: PathBuf,
) -> Result<(), String> {
    let recent_local_changes = state.new_recent_local_changes();
    let watcher = create_notes_watcher(
        app,
        root.clone(),
        window_label.clone(),
        recent_local_changes.clone(),
    )?;
    state.set_window_session(window_label, root, watcher, recent_local_changes)
}

pub(crate) fn update_close_space_menu(app: &tauri::AppHandle, state: &SpaceState) {
    let enabled = state
        .root_for_window_label(window_geometry::MAIN_WINDOW_LABEL)
        .is_ok();
    let _ = crate::set_space_close_menu_enabled(app, enabled);
}

#[tauri::command]
pub async fn space_create(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, SpaceState>,
    path: String,
) -> Result<SpaceInfo, String> {
    let root = PathBuf::from(path);
    let (info, welcome_note_created) = tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let root = canonicalize_dir(&root)?;
        create_or_open_impl(&root)
    })
    .await
    .map_err(|e| e.to_string())??;

    reset_schema_cache();
    install_window_session(
        app.clone(),
        &state,
        window.label().to_string(),
        PathBuf::from(&info.root),
    )?;
    emit_welcome_note_created(&app, &window, &info, welcome_note_created);
    update_close_space_menu(&app, &state);
    Ok(info)
}

#[tauri::command]
pub async fn space_open(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, SpaceState>,
    path: String,
) -> Result<SpaceInfo, String> {
    let root = PathBuf::from(path);
    let (info, welcome_note_created) = tauri::async_runtime::spawn_blocking(move || {
        let root = canonicalize_dir(&root)?;
        create_or_open_impl(&root)
    })
    .await
    .map_err(|e| e.to_string())??;

    reset_schema_cache();
    install_window_session(
        app.clone(),
        &state,
        window.label().to_string(),
        PathBuf::from(&info.root),
    )?;
    emit_welcome_note_created(&app, &window, &info, welcome_note_created);
    update_close_space_menu(&app, &state);
    Ok(info)
}

#[tauri::command]
pub fn space_get_current(
    window: tauri::WebviewWindow,
    state: State<'_, SpaceState>,
) -> Option<String> {
    state
        .root_for_window(&window)
        .ok()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn space_get_current_info(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, SpaceState>,
) -> Result<Option<SpaceInfo>, String> {
    let Ok(root) = state.root_for_window(&window) else {
        return Ok(None);
    };
    let (info, welcome_note_created) =
        tauri::async_runtime::spawn_blocking(move || create_or_open_impl(&root))
            .await
            .map_err(|e| e.to_string())??;
    emit_welcome_note_created(&app, &window, &info, welcome_note_created);
    Ok(Some(info))
}

#[tauri::command]
pub fn space_close(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, SpaceState>,
) -> Result<(), String> {
    state.remove_window_session(window.label())?;
    reset_schema_cache();
    update_close_space_menu(&app, &state);
    Ok(())
}
