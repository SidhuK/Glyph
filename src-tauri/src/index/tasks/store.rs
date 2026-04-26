use std::path::Path;

use crate::{io_atomic, paths};

use super::{
    parse::{apply_task_metadata, parse_tasks},
    types::{NoteTaskSummaryItem, ParsedTask},
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

pub fn query_note_task_summaries(
    conn: &rusqlite::Connection,
    note_paths: &[String],
) -> Result<Vec<NoteTaskSummaryItem>, String> {
    if note_paths.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders = std::iter::repeat_n("?", note_paths.len())
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT note_path, COUNT(*) AS total_count, SUM(CASE WHEN checked = 1 THEN 1 ELSE 0 END) AS completed_count
         FROM tasks
         WHERE note_path IN ({placeholders})
         GROUP BY note_path"
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params_from_iter(note_paths.iter()))
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let total_count = row.get::<_, i64>(1).map_err(|e| e.to_string())? as u32;
        let completed_count = row.get::<_, i64>(2).map_err(|e| e.to_string())? as u32;
        out.push(NoteTaskSummaryItem {
            note_path: row.get(0).map_err(|e| e.to_string())?,
            total_count,
            completed_count,
            open_count: total_count.saturating_sub(completed_count),
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

pub fn note_abs_path(space_root: &Path, note_path: &str) -> Result<std::path::PathBuf, String> {
    paths::join_under(space_root, Path::new(note_path))
}

pub fn write_note(path: &Path, text: &str) -> Result<(), String> {
    io_atomic::write_atomic(path, text.as_bytes()).map_err(|e| e.to_string())
}
