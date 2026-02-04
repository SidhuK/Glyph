use crate::tether_paths;
use std::path::{Path, PathBuf};

use super::schema::ensure_schema;

pub fn db_path(vault_root: &Path) -> Result<PathBuf, String> {
    tether_paths::tether_db_path(vault_root)
}

pub fn open_db(vault_root: &Path) -> Result<rusqlite::Connection, String> {
    let path = db_path(vault_root)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = rusqlite::Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    ensure_schema(&conn)?;
    Ok(conn)
}

pub fn resolve_title_to_id(
    conn: &rusqlite::Connection,
    title: &str,
) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM notes WHERE lower(title) = lower(?) LIMIT 2")
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
