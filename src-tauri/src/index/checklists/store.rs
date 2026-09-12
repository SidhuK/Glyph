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

pub fn index_checklist(
    conn: &Connection,
    note_id: &str,
    etag: &str,
    markdown: &str,
) -> Result<(), String> {
    let current = conn
        .query_row(
            "SELECT etag FROM note_checklists WHERE note_id = ?",
            [note_id],
            |row| row.get::<_, String>(0),
        )
        .ok();
    if current.as_deref() == Some(etag) {
        return Ok(());
    }
    let items = super::parse::parse_checklist_items(markdown);
    let completed = items.iter().filter(|item| item.checked).count();
    conn.execute(
        "UPDATE notes SET checklist_total = ?, checklist_completed = ? WHERE id = ?",
        rusqlite::params![items.len(), completed, note_id],
    )
    .map_err(|error| error.to_string())?;
    let json = serde_json::to_string(&items).map_err(|error| error.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO note_checklists(note_id, etag, items_json) VALUES (?, ?, ?)",
        rusqlite::params![note_id, etag, json],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn query_tasks(root: &std::path::Path) -> Result<Vec<super::types::InboxTask>, String> {
    let conn = crate::index::open_db(root)?;
    // Populate the derived cache for existing spaces. No note format migration.
    let missing: Vec<String> = {
        let mut statement = conn.prepare("SELECT n.path FROM notes n LEFT JOIN note_checklists c ON c.note_id = n.id AND c.etag = n.etag WHERE c.note_id IS NULL").map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<_, _>>()
            .map_err(|error| error.to_string())?
    };
    for path in missing {
        let absolute = crate::paths::join_under(root, std::path::Path::new(&path))?;
        match std::fs::read_to_string(&absolute) {
            Ok(markdown) => crate::index::index_note_with_conn(&conn, &path, &markdown, &absolute)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                crate::index::remove_note_with_conn(&conn, &path)?;
            }
            Err(error) => return Err(error.to_string()),
        }
    }
    let mut statement = conn.prepare("SELECT n.path, n.title, c.etag, c.items_json FROM notes n JOIN note_checklists c ON c.note_id = n.id AND c.etag = n.etag WHERE n.checklist_total > 0 ORDER BY n.title COLLATE NOCASE, n.path").map_err(|error| error.to_string())?;
    let mut rows = statement.query([]).map_err(|error| error.to_string())?;
    let mut tasks = Vec::new();
    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let path: String = row.get(0).map_err(|error| error.to_string())?;
        let title: String = row.get(1).map_err(|error| error.to_string())?;
        let etag: String = row.get(2).map_err(|error| error.to_string())?;
        let json: String = row.get(3).map_err(|error| error.to_string())?;
        let items: Vec<super::types::ParsedChecklistItem> =
            serde_json::from_str(&json).map_err(|error| error.to_string())?;
        tasks.extend(items.into_iter().map(|item| super::types::InboxTask {
            note_path: path.clone(),
            note_title: title.clone(),
            etag: etag.clone(),
            item,
        }));
    }
    Ok(tasks)
}
