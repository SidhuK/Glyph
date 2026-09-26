pub mod commands;

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::Serialize;

use crate::{paths, utils};

const VERSIONS_PER_NOTE: i64 = 100;

#[derive(Serialize)]
pub struct Snapshot {
    pub id: i64,
    pub path: String,
    pub timestamp_ms: i64,
    pub deleted: bool,
}

// Recovery is durable local data, separate from both Git and the rebuildable index.
fn open(root: &Path) -> Result<Connection, String> {
    let index_root = crate::index::paths::index_root_path()?;
    let dir = index_root
        .parent()
        .ok_or("invalid index root")?
        .join("recovery");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let key = utils::sha256_hex(root.to_string_lossy().as_bytes());
    let conn = Connection::open(dir.join(format!("{key}.sqlite"))).map_err(|e| e.to_string())?;
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    let version: u32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if version > 1 {
        return Err("unsupported recovery database version".to_string());
    }
    if version == 0 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL,
            timestamp_ms INTEGER NOT NULL,
            text TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS snapshots_path ON snapshots(path, id DESC);
        PRAGMA user_version = 1;",
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(conn)
}

pub fn note_path(root: &Path, path: &str) -> Result<PathBuf, String> {
    let rel = Path::new(path);
    crate::space_fs::helpers::deny_hidden_rel_path(rel)?;
    if !utils::is_markdown_path(rel) {
        return Err("recovery requires a Markdown note".to_string());
    }
    let abs = paths::join_under(root, rel)?;
    // join_under rejects traversal; also reject symlinks before reading or restoring.
    let mut current = root.to_path_buf();
    for part in rel.components() {
        current.push(part);
        match std::fs::symlink_metadata(&current) {
            Ok(meta) if meta.file_type().is_symlink() => {
                return Err("recovery does not follow symbolic links".to_string());
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(abs)
}

pub fn capture(root: &Path, path: &str, text: &str) -> Result<(), String> {
    note_path(root, path)?;
    capture_with_conn(&mut open(root)?, path, text)
}

fn capture_with_conn(conn: &mut Connection, path: &str, text: &str) -> Result<(), String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let latest: Option<String> = tx
        .query_row(
            "SELECT text FROM snapshots WHERE path = ? ORDER BY id DESC LIMIT 1",
            [path],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if latest.as_deref() == Some(text) {
        return Ok(());
    }
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;
    tx.execute(
        "INSERT INTO snapshots(path, timestamp_ms, text) VALUES (?, ?, ?)",
        params![path, timestamp, text],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM snapshots WHERE path = ? AND id NOT IN (
            SELECT id FROM snapshots WHERE path = ? ORDER BY id DESC LIMIT ?
        )",
        params![path, path, VERSIONS_PER_NOTE],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

pub fn current_text(root: &Path, path: &str) -> Result<Option<String>, String> {
    match std::fs::read_to_string(note_path(root, path)?) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn capture_tree(root: &Path, rel: &Path) -> Result<(), String> {
    capture_tree_with_conn(root, rel, &mut open(root)?, true)
}

pub fn capture_existing(root: &Path) -> Result<(), String> {
    capture_tree_with_conn(root, Path::new(""), &mut open(root)?, false)
}

fn capture_tree_with_conn(
    root: &Path,
    rel: &Path,
    conn: &mut Connection,
    strict: bool,
) -> Result<(), String> {
    let abs = paths::join_under(root, rel)?;
    let meta = std::fs::symlink_metadata(&abs).map_err(|e| e.to_string())?;
    if meta.file_type().is_symlink() {
        return Ok(());
    }
    if meta.is_dir() {
        for entry in std::fs::read_dir(abs).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry.file_name().to_string_lossy().starts_with('.') {
                if let Err(error) =
                    capture_tree_with_conn(root, &rel.join(entry.file_name()), conn, strict)
                {
                    if strict {
                        return Err(error);
                    }
                    tracing::warn!(%error, "existing note could not be snapshotted");
                }
            }
        }
    } else if utils::is_markdown_path(rel) {
        let path = utils::to_slash(rel);
        if let Some(text) = current_text(root, &path)? {
            capture_with_conn(conn, &path, &text)?;
        }
    }
    Ok(())
}

pub fn list(root: &Path, path: Option<&str>) -> Result<Vec<Snapshot>, String> {
    if let Some(path) = path {
        note_path(root, path)?;
    }
    let conn = open(root)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, path, timestamp_ms FROM snapshots
        WHERE (?1 IS NOT NULL AND path = ?1) OR
            (?1 IS NULL AND id IN (SELECT MAX(id) FROM snapshots GROUP BY path))
        ORDER BY id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([path], |row| {
            Ok(Snapshot {
                id: row.get(0)?,
                path: row.get(1)?,
                timestamp_ms: row.get(2)?,
                deleted: false,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut snapshots = Vec::new();
    for row in rows {
        let mut snapshot = row.map_err(|e| e.to_string())?;
        snapshot.deleted = !note_path(root, &snapshot.path)?
            .try_exists()
            .map_err(|e| e.to_string())?;
        snapshots.push(snapshot);
    }
    Ok(snapshots)
}

pub fn read(root: &Path, id: i64) -> Result<(String, String), String> {
    open(root)?
        .query_row(
            "SELECT path, text FROM snapshots WHERE id = ?",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())
}

pub fn rename(root: &Path, from: &str, to: &str) -> Result<(), String> {
    let mut conn = open(root)?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let paths = {
        let mut stmt = tx
            .prepare("SELECT DISTINCT path FROM snapshots")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    for path in paths {
        if let Some(next) = paths::rewrite_entry_path(&path, from, to) {
            // Non-Markdown destinations retain history at the original note path.
            if !utils::is_markdown_path(Path::new(&next)) {
                continue;
            }
            tx.execute(
                "UPDATE snapshots SET path = ? WHERE path = ?",
                params![next, path],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "DELETE FROM snapshots WHERE path = ? AND id NOT IN (
                SELECT id FROM snapshots WHERE path = ? ORDER BY id DESC LIMIT ?
            )",
                params![next, next, VERSIONS_PER_NOTE],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}
