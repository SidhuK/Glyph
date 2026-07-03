use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::io_atomic;

use super::types::{WindowGeometryRecord, WINDOW_GEOMETRY_STORE_VERSION};

const WINDOW_GEOMETRY_STORE_FILE: &str = "main_window_geometry.json";

pub fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join(WINDOW_GEOMETRY_STORE_FILE))
}

pub fn load_record(path: &Path) -> Result<Option<WindowGeometryRecord>, String> {
    match std::fs::read(path) {
        Ok(bytes) => {
            let record: WindowGeometryRecord =
                serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
            if record.version > WINDOW_GEOMETRY_STORE_VERSION {
                return Err(format!(
                    "unsupported window geometry store version {} (max supported {})",
                    record.version, WINDOW_GEOMETRY_STORE_VERSION
                ));
            }
            Ok(Some(record))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub fn save_record(path: &Path, record: &WindowGeometryRecord) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(record).map_err(|error| error.to_string())?;
    io_atomic::write_atomic(path, &bytes).map_err(|error| error.to_string())
}
