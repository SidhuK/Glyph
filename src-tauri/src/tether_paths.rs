use crate::paths;
use std::path::{Path, PathBuf};

pub const TETHER_DIR_NAME: &str = ".tether";
pub const TETHER_DB_NAME: &str = "tether.sqlite";

pub fn tether_dir(vault_root: &Path) -> Result<PathBuf, String> {
    paths::join_under(vault_root, Path::new(TETHER_DIR_NAME))
}

pub fn tether_db_path(vault_root: &Path) -> Result<PathBuf, String> {
    Ok(tether_dir(vault_root)?.join(TETHER_DB_NAME))
}

pub fn tether_cache_dir(vault_root: &Path) -> Result<PathBuf, String> {
    Ok(tether_dir(vault_root)?.join("cache"))
}

pub fn tether_assets_dir(vault_root: &Path) -> Result<PathBuf, String> {
    Ok(tether_dir(vault_root)?.join("assets"))
}

pub fn ensure_tether_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let dir = tether_dir(vault_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn ensure_tether_cache_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let dir = tether_cache_dir(vault_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

