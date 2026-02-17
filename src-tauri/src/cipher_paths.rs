use crate::paths;
use std::path::{Path, PathBuf};

pub const CIPHER_DIR_NAME: &str = ".cipher";
pub const CIPHER_DB_NAME: &str = "cipher.sqlite";
pub const CIPHER_APP_DIR_NAME: &str = "Cipher";
pub const AI_HISTORY_DIR_NAME: &str = "ai_history";

pub fn cipher_dir(vault_root: &Path) -> Result<PathBuf, String> {
    paths::join_under(vault_root, Path::new(CIPHER_DIR_NAME))
}

pub fn cipher_db_path(vault_root: &Path) -> Result<PathBuf, String> {
    Ok(cipher_dir(vault_root)?.join(CIPHER_DB_NAME))
}

pub fn cipher_cache_dir(vault_root: &Path) -> Result<PathBuf, String> {
    Ok(cipher_dir(vault_root)?.join("cache"))
}

pub fn cipher_app_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let base = cipher_dir(vault_root)?;
    paths::join_under(&base, Path::new(CIPHER_APP_DIR_NAME))
}

pub fn ai_history_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let base = cipher_app_dir(vault_root)?;
    paths::join_under(&base, Path::new(AI_HISTORY_DIR_NAME))
}

pub fn ensure_cipher_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let dir = cipher_dir(vault_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn ensure_cipher_cache_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let dir = cipher_cache_dir(vault_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn ensure_cipher_app_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let dir = cipher_app_dir(vault_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn ensure_ai_history_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let dir = ai_history_dir(vault_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}
