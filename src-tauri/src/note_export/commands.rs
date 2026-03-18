use std::path::PathBuf;

use tauri::{async_runtime::spawn_blocking, Manager, State};

use crate::{io_atomic, space::SpaceState};

fn resolved_export_path(path: &PathBuf) -> Result<PathBuf, String> {
    if path.exists() {
        return path.canonicalize().map_err(|e| e.to_string());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "path has no parent directory".to_string())?;
    let file_name = path
        .file_name()
        .ok_or_else(|| "path has no file name".to_string())?;
    let parent = parent.canonicalize().map_err(|e| e.to_string())?;
    Ok(parent.join(file_name))
}

fn is_within_root(path: &PathBuf, root: &PathBuf) -> bool {
    path.strip_prefix(root).is_ok()
}

#[tauri::command(rename_all = "snake_case")]
pub async fn export_write_text(
    app: tauri::AppHandle,
    state: State<'_, SpaceState>,
    abs_path: String,
    text: String,
) -> Result<(), String> {
    let home_dir = app.path().home_dir().map_err(|e| e.to_string())?;
    let space_root = state.current_root().ok();

    spawn_blocking(move || -> Result<(), String> {
        let path = PathBuf::from(abs_path);
        if !path.is_absolute() {
            return Err("abs_path must be absolute".to_string());
        }
        if path.as_os_str().is_empty() {
            return Err("path is required".to_string());
        }
        let resolved = resolved_export_path(&path)?;
        let home_dir = home_dir.canonicalize().map_err(|e| e.to_string())?;
        let safe_space_root = space_root
            .as_ref()
            .and_then(|root| root.canonicalize().ok());
        let is_allowed = is_within_root(&resolved, &home_dir)
            || safe_space_root
                .as_ref()
                .is_some_and(|root| is_within_root(&resolved, root));
        if !is_allowed {
            return Err(
                "export path must be inside your home directory or the current space".to_string(),
            );
        }
        if path.is_dir() {
            return Err("path points to a directory".to_string());
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        io_atomic::write_atomic(&path, text.as_bytes()).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
