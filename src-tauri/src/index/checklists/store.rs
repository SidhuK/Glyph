use rusqlite::Connection;

use crate::index::tags::{parse_frontmatter_tags, PEOPLE_TAG_NAMESPACE};

use super::details::task_details;
use super::lines::markdown_lines;
use super::parse::{checklist_items_in, summarize_items};
use super::types::NoteTaskSummaryItem;

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

fn note_frontmatter_tags(markdown: &str) -> Vec<String> {
    parse_frontmatter_tags(markdown)
        .into_iter()
        .filter(|tag| !tag.starts_with(PEOPLE_TAG_NAMESPACE))
        .collect()
}

fn json<T: serde::Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|e| e.to_string())
}

pub(crate) fn reindex_note_checklist_items(
    conn: &Connection,
    note_id: &str,
    markdown: &str,
) -> Result<(u32, u32), String> {
    let lines = markdown_lines(markdown);
    let items = checklist_items_in(&lines);
    conn.execute("DELETE FROM checklist_items WHERE note_id = ?", [note_id])
        .map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "INSERT INTO checklist_items(
               note_id, start, indent, status, status_kind, text, title, heading, due, priority,
               completion, cancelled, tags, note_tags, invalid, parent_start
             ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .map_err(|e| e.to_string())?;
    let note_tags = json(&note_frontmatter_tags(markdown))?;
    for item in items.iter().filter(|item| !item.moved) {
        let details = task_details(markdown, item);
        stmt.execute(rusqlite::params![
            note_id,
            item.start,
            item.indent,
            item.status.to_string(),
            item.status_kind.as_str(),
            item.text,
            details.title,
            item.heading,
            details.due,
            details.priority,
            details.completion,
            details.cancelled,
            json(&details.tags)?,
            note_tags,
            json(&details.invalid)?,
            item.parent.map(|parent| items[parent].start),
        ])
        .map_err(|e| e.to_string())?;
    }
    Ok(summarize_items(&items))
}
