use crate::{io_atomic, paths, tether_paths, vault::VaultState};
use std::path::{Path, PathBuf};
use tauri::State;

fn normalize_rel_path(raw: &str) -> Result<PathBuf, String> {
    let raw = raw.replace('\\', "/");
    let raw = raw.trim().trim_matches('/');
    if raw.is_empty() {
        return Err("path is required".to_string());
    }
    let mut out = PathBuf::new();
    for part in raw.split('/') {
        let part = part.trim();
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            return Err("invalid path".to_string());
        }
        out.push(part);
    }
    if out.as_os_str().is_empty() {
        Err("invalid path".to_string())
    } else {
        Ok(out)
    }
}

fn tether_abs_path(vault_root: &Path, rel_inside_tether: &Path) -> Result<PathBuf, String> {
    let tether_dir = tether_paths::ensure_tether_dir(vault_root)?;
    paths::join_under(&tether_dir, rel_inside_tether)
}

#[tauri::command]
pub async fn tether_read_text(state: State<'_, VaultState>, path: String) -> Result<String, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let rel = normalize_rel_path(&path)?;
        let abs = tether_abs_path(&root, &rel)?;
        let bytes = std::fs::read(&abs).map_err(|e| e.to_string())?;
        String::from_utf8(bytes).map_err(|_| "file is not valid UTF-8".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn tether_write_text(
    state: State<'_, VaultState>,
    path: String,
    text: String,
) -> Result<(), String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let rel = normalize_rel_path(&path)?;
        let abs = tether_abs_path(&root, &rel)?;
        if let Some(parent) = abs.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        io_atomic::write_atomic(&abs, text.as_bytes()).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

