use std::path::{Path, PathBuf};
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::{
    index::{self, db::reset_schema_cache},
    paths, utils, window_geometry,
};

use super::helpers::{
    canonicalize_dir, create_or_open_impl, ensure_onboarding_note_for_command, SpaceInfo,
};
use super::state::SpaceState;
use super::watcher::create_notes_watcher;

pub(crate) const SPACE_WINDOW_PREFIX: &str = "space-";

pub(crate) fn is_space_window(label: &str) -> bool {
    label.starts_with(SPACE_WINDOW_PREFIX)
}

fn space_window_label(root: &Path) -> String {
    let hash = utils::sha256_hex(root.to_string_lossy().as_bytes());
    format!("{SPACE_WINDOW_PREFIX}{}", &hash[..16])
}

fn space_window_title(root: &Path) -> String {
    root.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .map(|name| format!("{name} - Glyph"))
        .unwrap_or_else(|| "Glyph".to_string())
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

fn focus_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

pub(crate) fn update_close_space_menu(app: &tauri::AppHandle, state: &SpaceState) {
    let _ = crate::set_space_close_menu_enabled(app, !state.session_roots().is_empty());
}

#[tauri::command]
pub async fn space_create(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
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
    install_window_session(
        app.clone(),
        &state,
        window.label().to_string(),
        PathBuf::from(&info.root),
    )?;
    if window.label() == "main" {
        state.set_current_root(PathBuf::from(&info.root))?;
    }
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
    let info = tauri::async_runtime::spawn_blocking(move || -> Result<SpaceInfo, String> {
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
    if window.label() == "main" {
        state.set_current_root(PathBuf::from(&info.root))?;
    }
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
    window: tauri::WebviewWindow,
    state: State<'_, SpaceState>,
) -> Result<Option<SpaceInfo>, String> {
    let Ok(root) = state.root_for_window(&window) else {
        return Ok(None);
    };
    tauri::async_runtime::spawn_blocking(move || create_or_open_impl(&root).map(Some))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn space_show_onboarding_note(
    window: tauri::WebviewWindow,
    state: State<'_, SpaceState>,
) -> Result<String, String> {
    let root = state.root_for_window(&window)?;
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
    window: tauri::WebviewWindow,
    state: State<'_, SpaceState>,
) -> Result<(), String> {
    state.remove_window_session(window.label())?;
    reset_schema_cache();
    update_close_space_menu(&app, &state);
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_open_window(
    app: tauri::AppHandle,
    state: State<'_, SpaceState>,
    path: String,
    create: Option<bool>,
) -> Result<SpaceInfo, String> {
    let root = PathBuf::from(path);
    let should_create = create.unwrap_or(false);
    let info = tauri::async_runtime::spawn_blocking(move || -> Result<SpaceInfo, String> {
        if should_create {
            std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        }
        let root = canonicalize_dir(&root)?;
        create_or_open_impl(&root)
    })
    .await
    .map_err(|e| e.to_string())??;

    let root = PathBuf::from(&info.root);
    let label = space_window_label(&root);

    if let Some(window) = app.get_webview_window(&label) {
        focus_window(&window)?;
        return Ok(info);
    }

    install_window_session(app.clone(), &state, label.clone(), root.clone())?;

    let window = match WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::App(format!("index.html?window={label}").into()),
    )
    .title(space_window_title(&root))
    .inner_size(800.0, 600.0)
    .min_inner_size(
        window_geometry::MIN_INNER_WIDTH as f64,
        window_geometry::MIN_INNER_HEIGHT as f64,
    )
    .decorations(true)
    .title_bar_style(tauri::TitleBarStyle::Overlay)
    .hidden_title(true)
    .transparent(true)
    .shadow(true)
    .center()
    .build()
    {
        Ok(window) => window,
        Err(error) => {
            let _ = state.remove_window_session(&label);
            return Err(error.to_string());
        }
    };

    focus_window(&window)?;
    update_close_space_menu(&app, &state);
    Ok(info)
}
