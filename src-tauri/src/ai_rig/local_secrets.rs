use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use crate::{glyph_paths, io_atomic};

const AI_SECRETS_FILE: &str = "ai_secrets.json";

fn secrets_path(vault_root: &Path) -> Result<PathBuf, String> {
    let dir = glyph_paths::ensure_glyph_app_dir(vault_root)?;
    Ok(dir.join(AI_SECRETS_FILE))
}

fn read_map(path: &Path) -> HashMap<String, String> {
    let bytes = std::fs::read(path).unwrap_or_default();
    serde_json::from_slice(&bytes).unwrap_or_default()
}

fn write_map(path: &Path, map: &HashMap<String, String>) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(map).map_err(|e| e.to_string())?;
    io_atomic::write_atomic(path, &bytes).map_err(|e| e.to_string())
}

pub fn secret_get(vault_root: &Path, profile_id: &str) -> Result<Option<String>, String> {
    let path = secrets_path(vault_root)?;
    let map = read_map(&path);
    Ok(map.get(profile_id).map(ToString::to_string))
}

pub fn secret_set(vault_root: &Path, profile_id: &str, secret: &str) -> Result<(), String> {
    if secret.trim().is_empty() {
        return Err("empty secret".to_string());
    }
    let path = secrets_path(vault_root)?;
    let mut map = read_map(&path);
    map.insert(profile_id.to_string(), secret.trim().to_string());
    write_map(&path, &map)
}

pub fn secret_clear(vault_root: &Path, profile_id: &str) -> Result<(), String> {
    let path = secrets_path(vault_root)?;
    let mut map = read_map(&path);
    map.remove(profile_id);
    write_map(&path, &map)
}

pub fn secret_status(vault_root: &Path, profile_id: &str) -> Result<bool, String> {
    Ok(secret_get(vault_root, profile_id)?.is_some())
}

pub fn secret_ids(vault_root: &Path) -> Result<Vec<String>, String> {
    let path = secrets_path(vault_root)?;
    let map = read_map(&path);
    Ok(map.keys().cloned().collect())
}
