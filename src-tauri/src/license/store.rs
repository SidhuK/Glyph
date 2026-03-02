use crate::io_atomic;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use super::types::LicenseRecord;

const LICENSE_STORE_FILE: &str = "license.json";

pub fn license_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(LICENSE_STORE_FILE))
}

pub fn read_record(path: &Path) -> LicenseRecord {
    let bytes = std::fs::read(path).unwrap_or_default();
    serde_json::from_slice(&bytes).unwrap_or_default()
}

pub fn write_record(path: &Path, record: &LicenseRecord) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(record).map_err(|e| e.to_string())?;
    io_atomic::write_atomic(path, &bytes).map_err(|e| e.to_string())
}
