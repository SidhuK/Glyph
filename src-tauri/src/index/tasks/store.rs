use std::path::Path;

use crate::{io_atomic, paths};

use super::{
    parse::{apply_task_metadata, is_valid_date, parse_tasks},
    types::{IndexedTask, ParsedTask, TaskBucket},
};

fn task_id_for(note_id: &str, list_path: &str, line_start: i64, text_norm: &str) -> String {
    let key = format!("{note_id}|{list_path}|{line_start}|{text_norm}");
    super::super::helpers::sha256_hex(key.as_bytes())
}

pub fn delete_note_tasks(conn: &rusqlite::Connection, note_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM tasks_fts WHERE task_id IN (SELECT task_id FROM tasks WHERE note_id = ?)",
        [note_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tasks WHERE note_id = ?", [note_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn insert_task(
    conn: &rusqlite::Connection,
    note_id: &str,
    note_path: &str,
    note_updated: &str,
    note_etag: &str,
    task: &ParsedTask,
) -> Result<(), String> {
    let task_id = task_id_for(note_id, &task.list_path, task.line_start, &task.text_norm);
    let tags_json = serde_json::to_string(&task.tags).map_err(|e| e.to_string())?;
    let indexed_at = super::super::helpers::now_sqlite_compatible_iso8601();

    conn.execute(
        "INSERT OR REPLACE INTO tasks(
          task_id, note_id, note_path, line_start, line_end, list_path, indent,
          raw_text, text_norm, checked, status, priority, due_date, scheduled_date,
          start_date, completed_at, recurrence_rule, tags_json, project, section,
          source_hash, note_etag, note_updated, indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3, ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?, ?, ?, ?)",
        rusqlite::params![
            task_id,
            note_id,
            note_path,
            task.line_start,
            task.line_start,
            task.list_path,
            task.indent,
            task.raw_text,
            task.text_norm,
            if task.checked { 1 } else { 0 },
            task.status,
            task.due_date,
            task.scheduled_date,
            tags_json,
            task.section,
            super::super::helpers::sha256_hex(task.raw_text.as_bytes()),
            note_etag,
            note_updated,
            indexed_at,
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO tasks_fts(task_id, text, tags, project) VALUES(?, ?, ?, '')",
        rusqlite::params![task_id, task.text_norm, task.tags.join(" ")],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn reindex_note_tasks(
    conn: &rusqlite::Connection,
    note_id: &str,
    note_path: &str,
    note_updated: &str,
    note_etag: &str,
    markdown: &str,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM tasks_fts WHERE task_id IN (SELECT task_id FROM tasks WHERE note_id = ?)",
        [note_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tasks WHERE note_id = ?", [note_id])
        .map_err(|e| e.to_string())?;
    for task in parse_tasks(markdown) {
        insert_task(conn, note_id, note_path, note_updated, note_etag, &task)?;
    }
    Ok(())
}

pub fn query_tasks(
    conn: &rusqlite::Connection,
    bucket: TaskBucket,
    today: &str,
    limit: i64,
) -> Result<Vec<IndexedTask>, String> {
    if !is_valid_date(today) {
        return Err("invalid today date".to_string());
    }
    let (where_sql, order_sql) = match bucket {
        TaskBucket::Inbox => (
            "t.checked = 0 AND t.scheduled_date IS NULL AND t.due_date IS NULL",
            "t.note_updated DESC, n.title ASC, t.line_start ASC",
        ),
        TaskBucket::Today => (
            "t.checked = 0 AND ((t.scheduled_date IS NOT NULL AND t.scheduled_date <= ?) OR (t.due_date IS NOT NULL AND t.due_date <= ?))",
            "COALESCE(t.scheduled_date, t.due_date) ASC, t.priority ASC, n.title ASC, t.line_start ASC",
        ),
        TaskBucket::Upcoming => (
            "t.checked = 0 AND ((t.scheduled_date IS NOT NULL AND t.scheduled_date > ?) OR (t.due_date IS NOT NULL AND t.due_date > ?))",
            "COALESCE(t.scheduled_date, t.due_date) ASC, t.priority ASC, n.title ASC, t.line_start ASC",
        ),
    };

    let sql = format!(
        "SELECT t.task_id, t.note_id, n.title, t.note_path, t.line_start, t.raw_text, t.checked,
            t.status, t.priority, t.due_date, t.scheduled_date, t.section, t.note_updated
         FROM tasks t JOIN notes n ON n.id = t.note_id
         WHERE {where_sql} ORDER BY {order_sql} LIMIT ?"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut rows = match bucket {
        TaskBucket::Inbox => stmt.query(rusqlite::params![limit]),
        _ => stmt.query(rusqlite::params![today, today, limit]),
    }
    .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        out.push(IndexedTask {
            task_id: row.get(0).map_err(|e| e.to_string())?,
            note_id: row.get(1).map_err(|e| e.to_string())?,
            note_title: row.get(2).map_err(|e| e.to_string())?,
            note_path: row.get(3).map_err(|e| e.to_string())?,
            line_start: row.get(4).map_err(|e| e.to_string())?,
            raw_text: row.get(5).map_err(|e| e.to_string())?,
            checked: row.get::<_, i64>(6).map_err(|e| e.to_string())? == 1,
            status: row.get(7).map_err(|e| e.to_string())?,
            priority: row.get(8).map_err(|e| e.to_string())?,
            due_date: row.get(9).map_err(|e| e.to_string())?,
            scheduled_date: row.get(10).map_err(|e| e.to_string())?,
            section: row.get(11).map_err(|e| e.to_string())?,
            note_updated: row.get(12).map_err(|e| e.to_string())?,
        });
    }
    Ok(out)
}

pub fn mutate_task_line(
    markdown: &str,
    line_start: i64,
    checked: Option<bool>,
    scheduled_date: Option<&str>,
    due_date: Option<&str>,
) -> Option<String> {
    let newline = if markdown.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let mut lines: Vec<String> = markdown.lines().map(|line| line.to_string()).collect();
    let idx = (line_start as usize).saturating_sub(1);
    let line = lines.get(idx)?.clone();
    lines[idx] = apply_task_metadata(&line, checked, scheduled_date, due_date)?;
    let mut next = lines.join(newline);
    if markdown.ends_with(newline) {
        next.push_str(newline);
    }
    Some(next)
}

pub fn note_abs_path(vault_root: &Path, note_path: &str) -> Result<std::path::PathBuf, String> {
    paths::join_under(vault_root, Path::new(note_path))
}

pub fn write_note(path: &Path, text: &str) -> Result<(), String> {
    io_atomic::write_atomic(path, text.as_bytes()).map_err(|e| e.to_string())
}
