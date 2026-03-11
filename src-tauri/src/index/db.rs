use crate::glyph_paths;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use super::schema::ensure_schema;
const SCHEMA_VERSION: i64 = 2;

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
    let mut conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;

    if !is_schema_compatible(&conn)? {
        drop(conn);
        reset_db_family(&path)?;
        let reopened = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
        reopened
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| e.to_string())?;
        conn = reopened;
        let mut cache = schema_cache().lock().unwrap_or_else(|p| p.into_inner());
        cache.remove(&path);
    }

    let mut cache = schema_cache().lock().unwrap_or_else(|p| p.into_inner());
    if !cache.contains(&path) {
        ensure_schema(&conn)?;
        cache.insert(path);
    }

    Ok(conn)
}

pub fn db_exists(space_root: &Path) -> Result<bool, String> {
    Ok(db_path(space_root)?.exists())
}

pub fn index_ready(space_root: &Path) -> Result<bool, String> {
    if !db_exists(space_root)? {
        return Ok(false);
    }
    let conn = open_db(space_root)?;
    let status: String = conn
        .query_row(
            "SELECT status FROM index_state WHERE singleton = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(status == "ready")
}

fn is_schema_compatible(conn: &rusqlite::Connection) -> Result<bool, String> {
    let notes_exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'notes')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !notes_exists {
        return Ok(true);
    }

    let mut has_preview = false;
    let mut stmt = conn
        .prepare("PRAGMA table_info(notes)")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let name: String = row.get(1).map_err(|e| e.to_string())?;
        if name == "preview" {
            has_preview = true;
            break;
        }
    }
    if has_preview {
        return Ok(false);
    }

    let old_fts_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type = 'table' AND name IN ('notes_fts', 'tasks_fts')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if old_fts_count > 0 {
        return Ok(false);
    }

    let state_exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'index_state')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !state_exists {
        return Ok(false);
    }

    let version: i64 = conn
        .query_row(
            "SELECT schema_version FROM index_state WHERE singleton = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();
    Ok(version == SCHEMA_VERSION)
}

fn reset_db_family(path: &Path) -> Result<(), String> {
    for candidate in [
        path.to_path_buf(),
        PathBuf::from(format!("{}-wal", path.to_string_lossy())),
        PathBuf::from(format!("{}-shm", path.to_string_lossy())),
    ] {
        if candidate.exists() {
            std::fs::remove_file(&candidate).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
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
