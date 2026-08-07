use std::path::{Path, PathBuf};

use crate::io_atomic;

/// Custom theme files are tiny; refuse anything that cannot plausibly be one.
const MAX_CUSTOM_THEME_BYTES: u64 = 256 * 1024;

fn validate_json_path(path: &Path) -> Result<(), String> {
    let is_json = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"));
    if is_json {
        Ok(())
    } else {
        Err("theme files must use the .json extension".to_string())
    }
}

#[tauri::command]
pub async fn custom_theme_read(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let path = PathBuf::from(path);
        validate_json_path(&path)?;
        let size = std::fs::metadata(&path)
            .map_err(|error| error.to_string())?
            .len();
        if size > MAX_CUSTOM_THEME_BYTES {
            return Err("theme file is too large".to_string());
        }
        std::fs::read_to_string(&path).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn custom_theme_write(path: String, text: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let path = PathBuf::from(path);
        validate_json_path(&path)?;
        io_atomic::write_atomic(&path, text.as_bytes()).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}
