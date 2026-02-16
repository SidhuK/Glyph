use crate::paths;
use std::path::{Path, PathBuf};

pub const LATTICE_DIR_NAME: &str = ".lattice";
pub const LATTICE_DB_NAME: &str = "lattice.sqlite";
pub const LATTICE_APP_DIR_NAME: &str = "Lattice";
pub const AI_HISTORY_DIR_NAME: &str = "ai_history";

pub fn lattice_dir(vault_root: &Path) -> Result<PathBuf, String> {
    paths::join_under(vault_root, Path::new(LATTICE_DIR_NAME))
}

pub fn lattice_db_path(vault_root: &Path) -> Result<PathBuf, String> {
    Ok(lattice_dir(vault_root)?.join(LATTICE_DB_NAME))
}

pub fn lattice_cache_dir(vault_root: &Path) -> Result<PathBuf, String> {
    Ok(lattice_dir(vault_root)?.join("cache"))
}

pub fn lattice_app_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let base = lattice_dir(vault_root)?;
    paths::join_under(&base, Path::new(LATTICE_APP_DIR_NAME))
}

pub fn ai_history_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let base = lattice_app_dir(vault_root)?;
    paths::join_under(&base, Path::new(AI_HISTORY_DIR_NAME))
}

pub fn ensure_lattice_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let dir = lattice_dir(vault_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn ensure_lattice_cache_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let dir = lattice_cache_dir(vault_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn ensure_lattice_app_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let dir = lattice_app_dir(vault_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn ensure_ai_history_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let dir = ai_history_dir(vault_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}
