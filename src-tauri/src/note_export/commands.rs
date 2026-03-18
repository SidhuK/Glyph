use std::path::PathBuf;

use tauri::async_runtime::spawn_blocking;

use crate::io_atomic;

#[tauri::command(rename_all = "snake_case")]
pub async fn export_write_text(abs_path: String, text: String) -> Result<(), String> {
    spawn_blocking(move || -> Result<(), String> {
        let path = PathBuf::from(abs_path);
        if path.as_os_str().is_empty() {
            return Err("path is required".to_string());
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
