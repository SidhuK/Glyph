use serde::Serialize;
use std::path::{Path, PathBuf};

use crate::tether_paths;

#[derive(Serialize)]
pub struct VaultInfo {
    pub root: String,
    pub schema_version: u32,
}

pub const VAULT_SCHEMA_VERSION: u32 = 1;

pub fn ensure_tether_dirs(root: &Path) -> Result<(), String> {
    let _ = tether_paths::ensure_tether_dir(root)?;
    let _ = tether_paths::ensure_tether_cache_dir(root)?;
    Ok(())
}

pub fn canonicalize_dir(path: &Path) -> Result<PathBuf, String> {
    let p = path.canonicalize().map_err(|e| e.to_string())?;
    if !p.is_dir() {
        return Err("selected path is not a directory".to_string());
    }
    Ok(p)
}

pub fn create_or_open_impl(root: &Path) -> Result<VaultInfo, String> {
    ensure_tether_dirs(root)?;
    let _ = cleanup_tmp_files(root);
    Ok(VaultInfo {
        root: root.to_string_lossy().to_string(),
        schema_version: VAULT_SCHEMA_VERSION,
    })
}

fn cleanup_tmp_files(root: &Path) -> Result<(), String> {
    fn should_delete(file_name: &str) -> bool {
        (file_name.starts_with('.') && file_name.contains(".tmp."))
            || file_name.ends_with(".tmp")
            || file_name.contains(".import.tmp.")
    }

    fn recurse(dir: &Path) -> Result<(), String> {
        let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let path = entry.path();
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_dir() {
                let _ = recurse(&path);
                continue;
            }
            if !meta.is_file() {
                continue;
            }
            let name = match path.file_name().and_then(|s| s.to_str()) {
                Some(s) => s,
                None => continue,
            };
            if !should_delete(name) {
                continue;
            }
            let _ = std::fs::remove_file(&path);
        }
        Ok(())
    }

    if let Ok(dir) = tether_paths::tether_dir(root) {
        if dir.is_dir() {
            let _ = recurse(&dir);
        }
    }
    Ok(())
}
