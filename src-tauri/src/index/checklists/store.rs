use rusqlite::Connection;

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
