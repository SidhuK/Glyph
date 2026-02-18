use crate::paths;
use std::path::{Path, PathBuf};

pub const GLYPH_DIR_NAME: &str = ".glyph";
pub const GLYPH_DB_NAME: &str = "glyph.sqlite";
pub const GLYPH_APP_DIR_NAME: &str = "Glyph";
pub const AI_HISTORY_DIR_NAME: &str = "ai_history";

pub fn glyph_dir(vault_root: &Path) -> Result<PathBuf, String> {
    paths::join_under(vault_root, Path::new(GLYPH_DIR_NAME))
}

pub fn glyph_db_path(vault_root: &Path) -> Result<PathBuf, String> {
    Ok(glyph_dir(vault_root)?.join(GLYPH_DB_NAME))
}

pub fn glyph_cache_dir(vault_root: &Path) -> Result<PathBuf, String> {
    Ok(glyph_dir(vault_root)?.join("cache"))
}

pub fn glyph_app_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let base = glyph_dir(vault_root)?;
    paths::join_under(&base, Path::new(GLYPH_APP_DIR_NAME))
}

pub fn ai_history_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let base = glyph_app_dir(vault_root)?;
    paths::join_under(&base, Path::new(AI_HISTORY_DIR_NAME))
}

pub fn ensure_glyph_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let dir = glyph_dir(vault_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn ensure_glyph_cache_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let dir = glyph_cache_dir(vault_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn ensure_glyph_app_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let dir = glyph_app_dir(vault_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn ensure_ai_history_dir(vault_root: &Path) -> Result<PathBuf, String> {
    let dir = ai_history_dir(vault_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}
