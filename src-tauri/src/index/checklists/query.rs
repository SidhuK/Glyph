use rusqlite::types::Value;
use rusqlite::{Connection, Row};

use crate::notes::archive::ACTIVE_NOTES;

use super::api::{TaskQueryRequest, TaskRecord, TaskView};
use super::filters::TaskFilter;
use super::types::TaskStatusKind;

struct TaskRow {
    record: TaskRecord,
    note_tags: Vec<String>,
}

fn view_clause(request: &TaskQueryRequest) -> (String, Vec<Value>) {
    const OPEN: &str = "ci.status_kind IN ('todo', 'in_progress')";
    match request.view {
        TaskView::Today => (
            format!(
                "({OPEN} AND ci.due IS NOT NULL AND ci.due <= ?)
                 OR (ci.status_kind = 'done' AND ci.completion = ?)"
            ),
            vec![request.today.clone().into(), request.today.clone().into()],
        ),
        TaskView::Upcoming => (format!("{OPEN} AND ci.due IS NOT NULL"), Vec::new()),
        TaskView::All if request.filters.include_done => ("1 = 1".to_string(), Vec::new()),
        TaskView::All => (OPEN.to_string(), Vec::new()),
        TaskView::Done => (
            "ci.status_kind IN ('done', 'cancelled')".to_string(),
            Vec::new(),
        ),
    }
}

fn json_list<T: serde::de::DeserializeOwned>(raw: &str) -> Result<Vec<T>, String> {
    serde_json::from_str(raw).map_err(|e| e.to_string())
}

fn updated_ms(updated: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(updated).map_or(0, |time| time.timestamp_millis())
}

fn task_row(row: &Row<'_>) -> Result<TaskRow, String> {
    let get_err = |e: rusqlite::Error| e.to_string();
    let status: String = row.get(6).map_err(get_err)?;
    let updated: String = row.get(3).map_err(get_err)?;
    let record = TaskRecord {
        note_path: row.get(0).map_err(get_err)?,
        note_title: row.get(1).map_err(get_err)?,
        note_etag: row.get(2).map_err(get_err)?,
        note_updated_ms: updated_ms(&updated),
        start: row.get(4).map_err(get_err)?,
        indent: row.get(5).map_err(get_err)?,
        status_kind: TaskStatusKind::from_status(status.chars().next().unwrap_or(' ')),
        status,
        text: row.get(7).map_err(get_err)?,
        title: row.get(8).map_err(get_err)?,
        heading: row.get(9).map_err(get_err)?,
        due: row.get(10).map_err(get_err)?,
        priority: row.get(11).map_err(get_err)?,
        completion: row.get(12).map_err(get_err)?,
        cancelled: row.get(13).map_err(get_err)?,
        tags: json_list(&row.get::<_, String>(14).map_err(get_err)?)?,
        invalid: json_list(&row.get::<_, String>(16).map_err(get_err)?)?,
        parent_start: row.get(17).map_err(get_err)?,
        subtask_total: row.get(18).map_err(get_err)?,
        subtask_done: row.get(19).map_err(get_err)?,
    };
    Ok(TaskRow {
        record,
        note_tags: json_list(&row.get::<_, String>(15).map_err(get_err)?)?,
    })
}

fn note_paths_clause(note_paths: &[String], values: &mut Vec<Value>) -> String {
    if note_paths.is_empty() {
        return String::new();
    }
    values.extend(note_paths.iter().cloned().map(Value::from));
    let placeholders = vec!["?"; note_paths.len()].join(", ");
    format!(" AND n.id IN ({placeholders})")
}

pub(crate) fn query_tasks(
    conn: &Connection,
    request: &TaskQueryRequest,
) -> Result<Vec<TaskRecord>, String> {
    let filter = TaskFilter::new(&request.filters);
    let (view_sql, mut values) = view_clause(request);
    let note_sql = note_paths_clause(&request.filters.note_paths, &mut values);
    let sql = format!(
        "SELECT n.id, n.title, n.etag, n.updated, ci.start, ci.indent, ci.status, ci.text,
                ci.title, ci.heading, ci.due, ci.priority, ci.completion, ci.cancelled, ci.tags,
                ci.note_tags, ci.invalid, ci.parent_start,
                (SELECT COUNT(*) FROM checklist_items c
                  WHERE c.note_id = ci.note_id AND c.parent_start = ci.start
                    AND c.status_kind != 'cancelled'),
                (SELECT COUNT(*) FROM checklist_items c
                  WHERE c.note_id = ci.note_id AND c.parent_start = ci.start
                    AND c.status_kind = 'done')
         FROM checklist_items ci
         JOIN notes n ON n.id = ci.note_id
         WHERE {ACTIVE_NOTES} AND ({view_sql}){note_sql}
         ORDER BY n.id ASC, ci.start ASC"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params_from_iter(values.iter()))
        .map_err(|e| e.to_string())?;
    let mut records = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let task = task_row(row)?;
        if filter.matches(&task.record, &task.note_tags) {
            records.push(task.record);
        }
    }
    Ok(records)
}
