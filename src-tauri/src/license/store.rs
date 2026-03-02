use crate::io_atomic;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use super::types::LicenseRecord;

const LICENSE_STORE_FILE: &str = "license.json";
type LicenseStoreError = Box<dyn std::error::Error + Send + Sync>;

pub fn license_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(LICENSE_STORE_FILE))
}

pub fn read_record(path: &Path) -> Result<LicenseRecord, LicenseStoreError> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(serde_json::from_slice(&bytes)?),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(LicenseRecord::default()),
        Err(error) => Err(Box::new(error)),
    }
}

pub fn write_record(path: &Path, record: &LicenseRecord) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(record).map_err(|e| e.to_string())?;
    io_atomic::write_atomic(path, &bytes).map_err(|e| e.to_string())
}
