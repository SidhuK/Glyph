use crate::glyph_paths;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use super::schema::ensure_schema;

fn schema_cache() -> &'static Mutex<HashSet<PathBuf>> {
    static CACHE: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn db_path(space_root: &Path) -> Result<PathBuf, String> {
    glyph_paths::glyph_db_path(space_root)
}

pub fn open_db(space_root: &Path) -> Result<rusqlite::Connection, String> {
    let path = db_path(space_root)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;

    let mut cache = schema_cache().lock().unwrap_or_else(|p| p.into_inner());
    if !cache.contains(&path) {
        ensure_schema(&conn)?;
        cache.insert(path);
    }

    Ok(conn)
}

pub fn reset_schema_cache() {
    let mut cache = schema_cache().lock().unwrap_or_else(|p| p.into_inner());
    cache.clear();
}

pub fn resolve_title_to_id(
    conn: &rusqlite::Connection,
    title: &str,
) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM notes WHERE title = ? COLLATE NOCASE LIMIT 2")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([title]).map_err(|e| e.to_string())?;
    let first: Option<String> = match rows.next().map_err(|e| e.to_string())? {
        None => None,
        Some(r) => Some(r.get(0).map_err(|e| e.to_string())?),
    };
    let second = rows.next().map_err(|e| e.to_string())?;
    if first.is_some() && second.is_none() {
        Ok(first)
    } else {
        Ok(None)
    }
}
