use crate::{paths, utils};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

pub const GLYPH_DIR_NAME: &str = ".glyph";
pub const GLYPH_DB_NAME: &str = "glyph.sqlite";
pub const GLYPH_APP_DIR_NAME: &str = "Glyph";
pub const AI_HISTORY_DIR_NAME: &str = "ai_history";
const SPACES_DIR_NAME: &str = "spaces";

fn app_local_glyph_root_cell() -> &'static OnceLock<PathBuf> {
    static ROOT: OnceLock<PathBuf> = OnceLock::new();
    &ROOT
}

pub fn init_app_local_root(app: &AppHandle) -> Result<(), String> {
    let base = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let root = base.join(GLYPH_DIR_NAME);
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let _ = app_local_glyph_root_cell().set(root);
    Ok(())
}

fn app_local_glyph_root() -> Result<&'static PathBuf, String> {
    #[cfg(test)]
    if app_local_glyph_root_cell().get().is_none() {
        let fallback = std::env::temp_dir()
            .join("glyph-tests-app-config")
            .join(GLYPH_DIR_NAME);
        let _ = std::fs::create_dir_all(&fallback);
        let _ = app_local_glyph_root_cell().set(fallback);
    }
    app_local_glyph_root_cell()
        .get()
        .ok_or_else(|| "app-local glyph root not initialized".to_string())
}

pub fn space_id(space_root: &Path) -> String {
    let normalized = space_root
        .components()
        .filter_map(|component| component.as_os_str().to_str())
        .collect::<Vec<_>>()
        .join("/");
    utils::sha256_hex(normalized.as_bytes())
}

pub fn glyph_dir(space_root: &Path) -> Result<PathBuf, String> {
    Ok(app_local_glyph_root()?
        .join(SPACES_DIR_NAME)
        .join(space_id(space_root)))
}

pub fn glyph_db_path(space_root: &Path) -> Result<PathBuf, String> {
    Ok(glyph_dir(space_root)?.join(GLYPH_DB_NAME))
}

pub fn glyph_cache_dir(space_root: &Path) -> Result<PathBuf, String> {
    Ok(glyph_dir(space_root)?.join("cache"))
}

pub fn glyph_app_dir(space_root: &Path) -> Result<PathBuf, String> {
    let base = glyph_dir(space_root)?;
    paths::join_under(&base, Path::new(GLYPH_APP_DIR_NAME))
}

pub fn ai_history_dir(space_root: &Path) -> Result<PathBuf, String> {
    let base = glyph_app_dir(space_root)?;
    paths::join_under(&base, Path::new(AI_HISTORY_DIR_NAME))
}

pub fn ensure_glyph_dir(space_root: &Path) -> Result<PathBuf, String> {
    let dir = glyph_dir(space_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn ensure_glyph_cache_dir(space_root: &Path) -> Result<PathBuf, String> {
    let dir = glyph_cache_dir(space_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn ensure_glyph_app_dir(space_root: &Path) -> Result<PathBuf, String> {
    let dir = glyph_app_dir(space_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn ensure_ai_history_dir(space_root: &Path) -> Result<PathBuf, String> {
    let dir = ai_history_dir(space_root)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}
