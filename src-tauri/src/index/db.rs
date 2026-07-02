use crate::glyph_paths;
use crate::index::paths;
use std::collections::HashSet;
use std::ffi::CString;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use super::checklists::checklist_counts;
use super::schema::ensure_schema;

const INDEX_DB_VERSION: i32 = 7;
const WAL_SIZE_LIMIT_BYTES: i64 = 1_048_576;

fn schema_cache() -> &'static Mutex<HashSet<PathBuf>> {
    static CACHE: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashSet::new()))
}

fn migrate_if_needed(
    conn: &rusqlite::Connection,
    space_root: &Path,
) -> Result<(), String> {
    let current_version: i32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;

    if current_version >= INDEX_DB_VERSION {
        return Ok(());
    }

    if current_version < 2 {
        migrate_tags_table(conn)?;
    }

    if current_version < 3 {
        migrate_frontmatter_property_kinds(conn)?;
    }

    if current_version < 5 {
        migrate_status_property_kinds(conn)?;
    }

    if current_version < 6 {
        migrate_priority_property_kinds(conn)?;
    }

    if current_version < 7 {
        migrate_checklist_summary_columns(conn, space_root)?;
    }

    conn.pragma_update(None, "user_version", INDEX_DB_VERSION)
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn table_has_column(
    conn: &rusqlite::Connection,
    table_name: &str,
    column_name: &str,
) -> Result<bool, String> {
    let pragma = format!("PRAGMA table_info({table_name})");
    let mut stmt = conn.prepare(&pragma).map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let name = row.get::<_, String>(1).map_err(|e| e.to_string())?;
        if name == column_name {
            return Ok(true);
        }
    }
    Ok(false)
}

fn migrate_tags_table(conn: &rusqlite::Connection) -> Result<(), String> {
    if !table_has_column(conn, "tags", "is_explicit")? {
        conn.execute(
            "ALTER TABLE tags ADD COLUMN is_explicit INTEGER NOT NULL DEFAULT 0 CHECK (is_explicit IN (0,1))",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "CREATE INDEX IF NOT EXISTS tags_tag_explicit_idx ON tags(tag, is_explicit)",
        [],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tags", [])
        .map_err(|e| e.to_string())?;
    tracing::info!("Cleared legacy tag rows; next rebuild will repopulate hierarchical tags");
    Ok(())
}

fn migrate_frontmatter_property_kinds(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute(
        "UPDATE note_properties
         SET value_type = 'text'
         WHERE value_type NOT IN ('text', 'url', 'date', 'checkbox', 'tags', 'status', 'priority')",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn migrate_status_property_kinds(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute(
        "UPDATE note_properties
         SET value_type = 'status'
         WHERE value_type = 'text'
           AND (
             lower(replace(replace(trim(key), '_', ' '), '-', ' ')) IN
               ('status')
             OR lower(replace(replace(trim(key), '_', ' '), '-', ' ')) LIKE '% status'
           )",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn migrate_checklist_summary_columns(
    conn: &rusqlite::Connection,
    space_root: &Path,
) -> Result<(), String> {
    if !table_has_column(conn, "notes", "checklist_total")? {
        conn.execute(
            "ALTER TABLE notes ADD COLUMN checklist_total INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    if !table_has_column(conn, "notes", "checklist_completed")? {
        conn.execute(
            "ALTER TABLE notes ADD COLUMN checklist_completed INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    let mut stmt = conn
        .prepare("SELECT path FROM notes")
        .map_err(|e| e.to_string())?;
    let paths = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect::<Vec<_>>();

    let mut updates = Vec::new();
    for path in paths {
        let abs = crate::paths::join_under(space_root, Path::new(&path))?;
        let markdown = std::fs::read_to_string(&abs).map_err(|e| {
            format!("Failed to read note during checklist summary migration ({path}): {e}")
        })?;
        let (checklist_total, checklist_completed) = checklist_counts(&markdown);
        updates.push((path, checklist_total, checklist_completed));
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (path, checklist_total, checklist_completed) in updates {
        tx.execute(
            "UPDATE notes SET checklist_total = ?, checklist_completed = ? WHERE path = ?",
            rusqlite::params![checklist_total, checklist_completed, path],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.execute("DROP TABLE IF EXISTS tasks", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DROP TABLE IF EXISTS tasks_fts", [])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

fn migrate_priority_property_kinds(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute(
        "UPDATE note_properties
         SET value_type = 'priority'
         WHERE value_type != 'priority'
           AND (
             lower(replace(replace(trim(key), '_', ' '), '-', ' ')) IN
               ('priority')
             OR lower(replace(replace(trim(key), '_', ' '), '-', ' ')) LIKE '% priority'
           )",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn db_path(space_root: &Path) -> Result<PathBuf, String> {
    Ok(paths::ensure_index_dir(space_root)?.join(glyph_paths::GLYPH_DB_NAME))
}

fn configure_wal(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_size_limit", WAL_SIZE_LIMIT_BYTES)
        .map_err(|e| e.to_string())?;

    let db_name = CString::new("main").map_err(|e| e.to_string())?;
    let mut persist_wal = 1i32;
    let rc = unsafe {
        rusqlite::ffi::sqlite3_file_control(
            conn.handle(),
            db_name.as_ptr(),
            rusqlite::ffi::SQLITE_FCNTL_PERSIST_WAL,
            (&mut persist_wal as *mut i32).cast(),
        )
    };

    if rc != rusqlite::ffi::SQLITE_OK {
        return Err(format!(
            "Failed to enable persistent WAL sidecar files: {}",
            rusqlite::ffi::code_to_str(rc)
        ));
    }

    Ok(())
}

pub fn open_db(space_root: &Path) -> Result<rusqlite::Connection, String> {
    let path = db_path(space_root)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    configure_wal(&conn)?;

    let mut cache = schema_cache().lock().unwrap_or_else(|p| p.into_inner());
    if !cache.contains(&path) {
        ensure_schema(&conn)?;
        migrate_if_needed(&conn, space_root)?;
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
