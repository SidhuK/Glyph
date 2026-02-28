use std::path::PathBuf;
use tauri::State;

use crate::{paths, space::SpaceState};

use super::super::helpers::deny_hidden_rel_path;
use super::trash::move_path_to_trash;

#[tauri::command]
pub async fn space_create_dir(state: State<'_, SpaceState>, path: String) -> Result<(), String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let rel = PathBuf::from(&path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        std::fs::create_dir_all(abs).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn space_resolve_abs_path(
    state: State<'_, SpaceState>,
    path: String,
) -> Result<String, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let rel = PathBuf::from(&path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        if !abs.exists() {
            return Err("path does not exist".to_string());
        }
        if !abs.is_file() {
            return Err("path is not a file".to_string());
        }
        Ok(abs.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_rename_path(
    state: State<'_, SpaceState>,
    from_path: String,
    to_path: String,
) -> Result<(), String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let from_rel = PathBuf::from(&from_path);
        let to_rel = PathBuf::from(&to_path);
        deny_hidden_rel_path(&from_rel)?;
        deny_hidden_rel_path(&to_rel)?;
        let from_abs = paths::join_under(&root, &from_rel)?;
        let to_abs = paths::join_under(&root, &to_rel)?;
        if !from_abs.exists() {
            return Err("source path does not exist".to_string());
        }
        if to_abs.exists() {
            return Err("destination path already exists".to_string());
        }
        if let Some(parent) = to_abs.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::rename(from_abs, to_abs).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_delete_path(
    state: State<'_, SpaceState>,
    path: String,
    recursive: Option<bool>,
) -> Result<(), String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let rel = PathBuf::from(&path);
        if rel.as_os_str().is_empty() {
            return Err("path is required".to_string());
        }
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        let meta = std::fs::metadata(&abs).map_err(|e| e.to_string())?;
        if meta.is_dir() {
            if recursive.unwrap_or(false) {
                move_path_to_trash(&abs)
            } else {
                Err("recursive delete must be confirmed for directories".to_string())
            }
        } else {
            move_path_to_trash(&abs)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_relativize_path(
    state: State<'_, SpaceState>,
    abs_path: String,
) -> Result<String, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        let abs_input = PathBuf::from(abs_path);
        let abs = if abs_input.exists() {
            abs_input.canonicalize().map_err(|e| e.to_string())?
        } else {
            let parent = abs_input
                .parent()
                .ok_or_else(|| "path has no parent directory".to_string())?;
            let file_name = abs_input
                .file_name()
                .ok_or_else(|| "path has no file name".to_string())?;
            let parent = parent.canonicalize().map_err(|e| e.to_string())?;
            parent.join(file_name)
        };
        let rel = abs
            .strip_prefix(&root)
            .map_err(|_| "path is not inside the current space".to_string())?;
        Ok(rel.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
