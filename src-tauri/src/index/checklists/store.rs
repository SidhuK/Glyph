use rusqlite::Connection;

use crate::databases::source::recursive_folder_clause;
use crate::index::commands::normalize_folder_prefix;
use crate::index::tags::normalize_tag;
use crate::notes::archive::ACTIVE_NOTES;

use super::parse::{parse_checklist_items, summarize_items};
use super::types::{NoteTaskSummaryItem, TaskItem, TaskNoteGroup, TaskScope};

pub fn query_note_checklist_summaries(
    conn: &Connection,
    note_paths: &[String],
) -> Result<Vec<NoteTaskSummaryItem>, String> {
    if note_paths.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders = std::iter::repeat_n("?", note_paths.len())
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT path, checklist_total, checklist_completed
         FROM notes
         WHERE id IN ({placeholders})
           AND checklist_total > 0"
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params_from_iter(note_paths.iter()))
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let note_path = row.get::<_, String>(0).map_err(|e| e.to_string())?;
        let total_count: u32 = row.get(1).map_err(|e| e.to_string())?;
        let completed_count: u32 = row.get(2).map_err(|e| e.to_string())?;
        out.push(NoteTaskSummaryItem {
            note_path,
            total_count,
            completed_count,
            open_count: total_count.saturating_sub(completed_count),
        });
    }

    Ok(out)
}

/// Replaces the note's open, non-moved `checklist_items` rows and returns
/// (total, completed) over all of its checklist items.
pub(crate) fn reindex_note_checklist_items(
    conn: &Connection,
    note_id: &str,
    markdown: &str,
) -> Result<(u32, u32), String> {
    let items = parse_checklist_items(markdown);
    conn.execute("DELETE FROM checklist_items WHERE note_id = ?", [note_id])
        .map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "INSERT INTO checklist_items(note_id, start, indent, text, heading)
             VALUES(?, ?, ?, ?, ?)",
        )
        .map_err(|e| e.to_string())?;
    for item in items.iter().filter(|item| !item.checked && !item.moved) {
        stmt.execute(rusqlite::params![
            note_id,
            item.start,
            item.indent,
            item.text,
            item.heading,
        ])
        .map_err(|e| e.to_string())?;
    }
    let summary = summarize_items(&items);
    Ok((summary.total_count, summary.completed_count))
}

/// Open checklist items grouped by note, most recently updated first.
pub(crate) fn query_open_tasks(
    conn: &Connection,
    scope: &TaskScope,
) -> Result<Vec<TaskNoteGroup>, String> {
    let (scope_sql, bind_values) = match scope {
        TaskScope::All => ("1 = 1".to_string(), Vec::new()),
        TaskScope::Folder { folder_prefix } => recursive_folder_clause(
            &normalize_folder_prefix(Some(folder_prefix.clone())).unwrap_or_default(),
        ),
        TaskScope::Tag { tag } => match normalize_tag(tag) {
            Some(tag) => (
                "EXISTS (SELECT 1 FROM tags t WHERE t.note_id = n.id AND t.tag = ?)".to_string(),
                vec![tag],
            ),
            None => return Ok(Vec::new()),
        },
    };
    let sql = format!(
        "SELECT n.id, n.title, n.etag, n.checklist_total, ci.start, ci.indent, ci.text, ci.heading
         FROM checklist_items ci
         JOIN notes n ON n.id = ci.note_id
         WHERE ({scope_sql}) AND {ACTIVE_NOTES}
         ORDER BY n.updated DESC, n.id ASC, ci.start ASC"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params_from_iter(bind_values.iter()))
        .map_err(|e| e.to_string())?;

    let mut groups: Vec<TaskNoteGroup> = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let note_path: String = row.get(0).map_err(|e| e.to_string())?;
        let item = TaskItem {
            start: row.get::<_, usize>(4).map_err(|e| e.to_string())?,
            indent: row.get::<_, usize>(5).map_err(|e| e.to_string())?,
            text: row.get(6).map_err(|e| e.to_string())?,
            heading: row.get(7).map_err(|e| e.to_string())?,
        };
        match groups.last_mut() {
            Some(group) if group.note_path == note_path => group.items.push(item),
            _ => groups.push(TaskNoteGroup {
                note_path,
                title: row.get(1).map_err(|e| e.to_string())?,
                etag: row.get(2).map_err(|e| e.to_string())?,
                total_count: row.get(3).map_err(|e| e.to_string())?,
                items: vec![item],
            }),
        }
    }
    Ok(groups)
}
