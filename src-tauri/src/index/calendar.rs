use chrono::{DateTime, Days, Local, NaiveDate};
use rusqlite::{params_from_iter, Connection};
use serde::Deserialize;
use tauri::State;

use crate::space::SpaceState;

use super::db::open_db;
use super::tasks::parse::{is_valid_date, strip_schedule_tokens};
use super::types::{CalendarItem, CalendarLoadResult, CalendarNoteDateProperty};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CalendarSourceKind {
    Space,
    Folder,
    DailyNotes,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CalendarMode {
    Notes,
    DailyNotes,
    Tasks,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CalendarSource {
    pub kind: CalendarSourceKind,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub recursive: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CalendarQueryRequest {
    pub mode: CalendarMode,
    pub source: CalendarSource,
    pub start_date: String,
    pub end_date: String,
    #[serde(default)]
    pub note_date_property_key: Option<String>,
    #[serde(default)]
    pub note_date_property_kind: Option<String>,
    #[serde(default)]
    pub daily_notes_folder: Option<String>,
}

fn normalize_rel_path(raw: &str) -> Result<String, String> {
    let normalized = raw.trim().trim_matches('/').replace('\\', "/");
    if normalized.is_empty() {
        return Ok(String::new());
    }

    for component in normalized.split('/') {
        if component.is_empty() || component == ".." {
            return Err(format!("invalid relative path component '{component}'"));
        }
    }

    Ok(normalized)
}

fn folder_like_pattern(folder: &str) -> String {
    format!("{folder}/%")
}

fn direct_folder_clause(field: &str, dir: &str) -> (String, Vec<String>) {
    if dir.is_empty() {
        return (format!("instr({field}, '/') = 0"), Vec::new());
    }

    let dir_char_len = dir.chars().count();
    (
        format!("{field} LIKE ? AND instr(substr({field}, ?), '/') = 0"),
        vec![folder_like_pattern(dir), (dir_char_len + 2).to_string()],
    )
}

fn recursive_folder_clause(field: &str, dir: &str) -> (String, Vec<String>) {
    if dir.is_empty() {
        return ("1 = 1".to_string(), Vec::new());
    }
    (format!("{field} LIKE ?"), vec![folder_like_pattern(dir)])
}

fn source_clause(
    field: &str,
    source: &CalendarSource,
    daily_notes_folder: Option<&str>,
) -> Result<(String, Vec<String>), String> {
    match source.kind {
        CalendarSourceKind::Space => Ok(("1 = 1".to_string(), Vec::new())),
        CalendarSourceKind::Folder => {
            let path = normalize_rel_path(source.path.as_deref().unwrap_or_default())?;
            let recursive = source.recursive.unwrap_or(true);
            Ok(if recursive {
                recursive_folder_clause(field, &path)
            } else {
                direct_folder_clause(field, &path)
            })
        }
        CalendarSourceKind::DailyNotes => {
            let folder = daily_notes_folder
                .ok_or_else(|| "daily notes folder is not configured".to_string())
                .and_then(normalize_rel_path)?;
            Ok(recursive_folder_clause(field, &folder))
        }
    }
}

fn parse_iso_date(raw: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(raw, "%Y-%m-%d").ok()
}

fn normalize_date_range(
    start_date: &str,
    end_date: &str,
) -> Result<(NaiveDate, NaiveDate), String> {
    if !is_valid_date(start_date) || !is_valid_date(end_date) {
        return Err("calendar query range must use YYYY-MM-DD dates".to_string());
    }
    let start = parse_iso_date(start_date).ok_or_else(|| "invalid start date".to_string())?;
    let end = parse_iso_date(end_date).ok_or_else(|| "invalid end date".to_string())?;
    if start > end {
        return Err("calendar start date must be before end date".to_string());
    }
    Ok((start, end))
}

fn date_in_range(date: &str, start: NaiveDate, end: NaiveDate) -> bool {
    parse_iso_date(date).is_some_and(|parsed| parsed >= start && parsed <= end)
}

fn datetime_to_local_date(value: &str) -> Option<String> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|datetime| datetime.with_timezone(&Local).format("%F").to_string())
}

fn parse_daily_note_date(path: &str) -> Option<String> {
    let file_name = path.rsplit('/').next()?;
    let stem = file_name.strip_suffix(".md")?;
    if !is_valid_date(stem) {
        return None;
    }
    Some(stem.to_string())
}

fn note_date_properties(
    conn: &Connection,
    source: &CalendarSource,
    daily_notes_folder: Option<&str>,
) -> Result<Vec<CalendarNoteDateProperty>, String> {
    let (source_sql, source_params) = source_clause("n.id", source, daily_notes_folder)?;
    let sql = format!(
        "SELECT np.key, np.value_type, COUNT(*) as count
         FROM note_properties np
         JOIN notes n ON n.id = np.note_id
         WHERE np.value_type IN ('date', 'datetime') AND {source_sql}
         GROUP BY np.key, np.value_type
         ORDER BY count DESC, np.key ASC"
    );
    let params: Vec<rusqlite::types::Value> = source_params
        .into_iter()
        .map(rusqlite::types::Value::from)
        .collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(params_from_iter(params.iter()))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        out.push(CalendarNoteDateProperty {
            key: row.get(0).map_err(|e| e.to_string())?,
            kind: row.get(1).map_err(|e| e.to_string())?,
            count: row.get::<_, i64>(2).map_err(|e| e.to_string())? as u32,
        });
    }
    Ok(out)
}

fn note_items(
    conn: &Connection,
    request: &CalendarQueryRequest,
    start: NaiveDate,
    end: NaiveDate,
) -> Result<Vec<CalendarItem>, String> {
    let Some(property_key) = request.note_date_property_key.as_deref() else {
        return Ok(Vec::new());
    };
    let property_kind = request.note_date_property_kind.as_deref().unwrap_or("date");

    let (source_sql, source_params) = source_clause(
        "n.id",
        &request.source,
        request.daily_notes_folder.as_deref(),
    )?;

    let mut params: Vec<rusqlite::types::Value> = vec![
        rusqlite::types::Value::from(property_key.to_string()),
        rusqlite::types::Value::from(property_kind.to_string()),
    ];
    let mut sql = format!(
        "SELECT n.id, n.title, n.preview, np.value_text
         FROM note_properties np
         JOIN notes n ON n.id = np.note_id
         WHERE np.key = ? AND np.value_type = ? AND {source_sql}"
    );
    params.extend(source_params.into_iter().map(rusqlite::types::Value::from));

    if property_kind == "date" {
        sql.push_str(" AND np.value_text >= ? AND np.value_text <= ?");
        params.push(rusqlite::types::Value::from(start.format("%F").to_string()));
        params.push(rusqlite::types::Value::from(end.format("%F").to_string()));
    } else if property_kind == "datetime" {
        let start_buffer = start
            .checked_sub_days(Days::new(1))
            .unwrap_or(start)
            .format("%F")
            .to_string();
        let end_buffer = end
            .checked_add_days(Days::new(1))
            .unwrap_or(end)
            .format("%F")
            .to_string();
        sql.push_str(
            " AND substr(np.value_text, 1, 10) >= ? AND substr(np.value_text, 1, 10) <= ?",
        );
        params.push(rusqlite::types::Value::from(start_buffer));
        params.push(rusqlite::types::Value::from(end_buffer));
    }
    sql.push_str(" ORDER BY np.value_text ASC, n.updated DESC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(params_from_iter(params.iter()))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let rel_path = row.get::<_, String>(0).map_err(|e| e.to_string())?;
        let raw_value = row.get::<_, String>(3).map_err(|e| e.to_string())?;
        let date = match property_kind {
            "date" if date_in_range(&raw_value, start, end) => Some(raw_value),
            "datetime" => {
                datetime_to_local_date(&raw_value).filter(|value| date_in_range(value, start, end))
            }
            _ => None,
        };
        let Some(date) = date else {
            continue;
        };
        out.push(CalendarItem {
            id: format!("note:{rel_path}:{property_key}:{date}"),
            kind: "note".to_string(),
            date,
            title: row.get(1).map_err(|e| e.to_string())?,
            rel_path: Some(rel_path),
            preview: Some(row.get::<_, String>(2).map_err(|e| e.to_string())?),
            badges: Vec::new(),
        });
    }

    Ok(out)
}

fn daily_note_items(
    conn: &Connection,
    source: &CalendarSource,
    daily_notes_folder: Option<&str>,
    start: NaiveDate,
    end: NaiveDate,
) -> Result<Vec<CalendarItem>, String> {
    let (source_sql, source_params) = source_clause("n.id", source, daily_notes_folder)?;
    let folder = daily_notes_folder
        .ok_or_else(|| "daily notes folder is not configured".to_string())
        .and_then(normalize_rel_path)?;
    let start_bound = if folder.is_empty() {
        format!("{}.md", start.format("%F"))
    } else {
        format!("{folder}/{}.md", start.format("%F"))
    };
    let end_bound = if folder.is_empty() {
        format!("{}.md", end.format("%F"))
    } else {
        format!("{folder}/{}.md", end.format("%F"))
    };
    let sql = format!(
        "SELECT n.id, n.title, n.preview
         FROM notes n
         WHERE {source_sql}
           AND n.id >= ? AND n.id <= ?
         ORDER BY n.id ASC"
    );
    let mut params: Vec<rusqlite::types::Value> = source_params
        .into_iter()
        .map(rusqlite::types::Value::from)
        .collect();
    params.push(rusqlite::types::Value::from(start_bound));
    params.push(rusqlite::types::Value::from(end_bound));
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(params_from_iter(params.iter()))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let rel_path = row.get::<_, String>(0).map_err(|e| e.to_string())?;
        let Some(date) = parse_daily_note_date(&rel_path) else {
            continue;
        };
        if !date_in_range(&date, start, end) {
            continue;
        }
        let title = row.get::<_, String>(1).map_err(|e| e.to_string())?;
        out.push(CalendarItem {
            id: format!("daily-note:{rel_path}"),
            kind: "daily_note".to_string(),
            date: date.clone(),
            title: if title.trim().is_empty() { date } else { title },
            rel_path: Some(rel_path),
            preview: Some(row.get::<_, String>(2).map_err(|e| e.to_string())?),
            badges: Vec::new(),
        });
    }

    Ok(out)
}

fn task_items(
    conn: &Connection,
    source: &CalendarSource,
    daily_notes_folder: Option<&str>,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<CalendarItem>, String> {
    let (source_sql, source_params) = source_clause("t.note_path", source, daily_notes_folder)?;
    let sql = format!(
        "SELECT t.task_id, n.title, t.note_path, t.raw_text, t.scheduled_date, t.due_date
         FROM tasks t
         JOIN notes n ON n.id = t.note_id
         WHERE t.checked = 0
           AND (
                (t.scheduled_date IS NOT NULL AND t.scheduled_date >= ? AND t.scheduled_date <= ?)
             OR (t.due_date IS NOT NULL AND t.due_date >= ? AND t.due_date <= ?)
           )
           AND {source_sql}
         ORDER BY COALESCE(t.scheduled_date, t.due_date) ASC, n.title ASC, t.line_start ASC"
    );
    let mut params: Vec<rusqlite::types::Value> = vec![
        rusqlite::types::Value::from(start_date.to_string()),
        rusqlite::types::Value::from(end_date.to_string()),
        rusqlite::types::Value::from(start_date.to_string()),
        rusqlite::types::Value::from(end_date.to_string()),
    ];
    params.extend(source_params.into_iter().map(rusqlite::types::Value::from));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(params_from_iter(params.iter()))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let task_id = row.get::<_, String>(0).map_err(|e| e.to_string())?;
        let note_title = row.get::<_, String>(1).map_err(|e| e.to_string())?;
        let note_path = row.get::<_, String>(2).map_err(|e| e.to_string())?;
        let raw_text = row.get::<_, String>(3).map_err(|e| e.to_string())?;
        let scheduled_date = row.get::<_, Option<String>>(4).map_err(|e| e.to_string())?;
        let due_date = row.get::<_, Option<String>>(5).map_err(|e| e.to_string())?;
        let title = strip_schedule_tokens(&raw_text);
        let scheduled_in_range = scheduled_date
            .as_deref()
            .is_some_and(|value| value >= start_date && value <= end_date);
        let due_in_range = due_date
            .as_deref()
            .is_some_and(|value| value >= start_date && value <= end_date);

        if scheduled_in_range && due_in_range && scheduled_date.as_deref() == due_date.as_deref() {
            if let Some(date) = scheduled_date.clone() {
                out.push(CalendarItem {
                    id: format!("task:{task_id}:combined:{date}"),
                    kind: "task".to_string(),
                    date,
                    title: title.clone(),
                    rel_path: Some(note_path.clone()),
                    preview: Some(note_title.clone()),
                    badges: vec!["Scheduled".to_string(), "Due".to_string()],
                });
            }
            continue;
        }

        if let Some(date) = scheduled_date.filter(|_| scheduled_in_range) {
            out.push(CalendarItem {
                id: format!("task:{task_id}:scheduled:{date}"),
                kind: "task".to_string(),
                date,
                title: title.clone(),
                rel_path: Some(note_path.clone()),
                preview: Some(note_title.clone()),
                badges: vec!["Scheduled".to_string()],
            });
        }

        if let Some(date) = due_date.filter(|_| due_in_range) {
            out.push(CalendarItem {
                id: format!("task:{task_id}:due:{date}"),
                kind: "task".to_string(),
                date,
                title: title.clone(),
                rel_path: Some(note_path.clone()),
                preview: Some(note_title.clone()),
                badges: vec!["Due".to_string()],
            });
        }
    }

    Ok(out)
}

fn load_calendar(
    conn: &Connection,
    request: &CalendarQueryRequest,
) -> Result<CalendarLoadResult, String> {
    let (start, end) = normalize_date_range(&request.start_date, &request.end_date)?;
    let note_date_properties = if request.mode == CalendarMode::Notes {
        note_date_properties(conn, &request.source, request.daily_notes_folder.as_deref())?
    } else {
        Vec::new()
    };

    let mut items = match request.mode {
        CalendarMode::Notes => note_items(conn, request, start, end)?,
        CalendarMode::DailyNotes => daily_note_items(
            conn,
            &request.source,
            request.daily_notes_folder.as_deref(),
            start,
            end,
        )?,
        CalendarMode::Tasks => task_items(
            conn,
            &request.source,
            request.daily_notes_folder.as_deref(),
            &request.start_date,
            &request.end_date,
        )?,
    };

    items.sort_by(|left, right| {
        left.date
            .cmp(&right.date)
            .then_with(|| left.title.cmp(&right.title))
            .then_with(|| left.id.cmp(&right.id))
    });

    Ok(CalendarLoadResult {
        items,
        note_date_properties,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn calendar_query(
    state: State<'_, SpaceState>,
    request: CalendarQueryRequest,
) -> Result<CalendarLoadResult, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<CalendarLoadResult, String> {
        let conn = open_db(&root)?;
        load_calendar(&conn, &request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;
    use rusqlite::{params, Connection};

    use crate::index::schema::ensure_schema;

    use super::{
        daily_note_items, load_calendar, parse_daily_note_date, CalendarMode,
        CalendarQueryRequest, CalendarSource, CalendarSourceKind,
    };

    fn insert_note(conn: &Connection, id: &str, title: &str, preview: &str) {
        conn.execute(
            "INSERT INTO notes(id, title, created, updated, path, etag, preview) VALUES(?, ?, '2026-03-10T00:00:00Z', '2026-03-10T00:00:00Z', ?, 'etag', ?)",
            params![id, title, id, preview],
        )
        .unwrap();
    }

    fn insert_property(conn: &Connection, note_id: &str, key: &str, kind: &str, value_text: &str) {
        conn.execute(
            "INSERT INTO note_properties(note_id, key, value_type, value_text, value_json, ordinal) VALUES(?, ?, ?, ?, '\"\"', 0)",
            params![note_id, key, kind, value_text],
        )
        .unwrap();
    }

    #[test]
    fn parses_daily_note_dates_from_paths() {
        assert_eq!(
            parse_daily_note_date("journal/2026-03-12.md"),
            Some("2026-03-12".to_string())
        );
        assert_eq!(parse_daily_note_date("journal/not-a-date.md"), None);
    }

    #[test]
    fn notes_mode_filters_by_folder_and_counts_date_properties() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        insert_note(&conn, "work/one.md", "One", "Preview one");
        insert_note(&conn, "work/two.md", "Two", "Preview two");
        insert_note(&conn, "personal/three.md", "Three", "Preview three");
        insert_property(&conn, "work/one.md", "date", "date", "2026-03-12");
        insert_property(&conn, "work/two.md", "date", "date", "2026-03-13");
        insert_property(&conn, "personal/three.md", "date", "date", "2026-03-12");

        let request = CalendarQueryRequest {
            mode: CalendarMode::Notes,
            source: CalendarSource {
                kind: CalendarSourceKind::Folder,
                path: Some("work".to_string()),
                recursive: Some(true),
            },
            start_date: "2026-03-01".to_string(),
            end_date: "2026-03-31".to_string(),
            note_date_property_key: Some("date".to_string()),
            note_date_property_kind: Some("date".to_string()),
            daily_notes_folder: None,
        };

        let result = load_calendar(&conn, &request).unwrap();
        assert_eq!(result.note_date_properties.len(), 1);
        assert_eq!(result.note_date_properties[0].count, 2);
        assert_eq!(result.items.len(), 2);
        assert!(result.items.iter().all(|item| {
            item.rel_path
                .as_deref()
                .is_some_and(|path| path.starts_with("work/"))
        }));
    }

    #[test]
    fn notes_mode_direct_folder_filter_supports_unicode_folder_names() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        insert_note(&conn, "cafe/one.md", "ASCII sibling", "Preview one");
        insert_note(&conn, "café/deux.md", "Unicode child", "Preview two");
        insert_note(&conn, "café/nested/trois.md", "Nested unicode child", "Preview three");
        insert_property(&conn, "cafe/one.md", "date", "date", "2026-03-11");
        insert_property(&conn, "café/deux.md", "date", "date", "2026-03-12");
        insert_property(&conn, "café/nested/trois.md", "date", "date", "2026-03-13");

        let result = load_calendar(
            &conn,
            &CalendarQueryRequest {
                mode: CalendarMode::Notes,
                source: CalendarSource {
                    kind: CalendarSourceKind::Folder,
                    path: Some("café".to_string()),
                    recursive: Some(false),
                },
                start_date: "2026-03-01".to_string(),
                end_date: "2026-03-31".to_string(),
                note_date_property_key: Some("date".to_string()),
                note_date_property_kind: Some("date".to_string()),
                daily_notes_folder: None,
            },
        )
        .unwrap();

        assert_eq!(result.note_date_properties.len(), 1);
        assert_eq!(result.note_date_properties[0].count, 1);
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].rel_path.as_deref(), Some("café/deux.md"));
    }

    #[test]
    fn daily_notes_mode_ignores_non_daily_note_filenames() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        insert_note(&conn, "journal/2026-03-12.md", "2026-03-12", "");
        insert_note(&conn, "journal/template.md", "Template", "");

        let items = daily_note_items(
            &conn,
            &CalendarSource {
                kind: CalendarSourceKind::DailyNotes,
                path: None,
                recursive: None,
            },
            Some("journal"),
            NaiveDate::from_ymd_opt(2026, 3, 1).unwrap(),
            NaiveDate::from_ymd_opt(2026, 3, 31).unwrap(),
        )
        .unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].date, "2026-03-12");
    }

    #[test]
    fn tasks_mode_emits_combined_and_split_task_items() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        insert_note(&conn, "work/todos.md", "Todos", "");
        conn.execute(
            "INSERT INTO tasks(task_id, note_id, note_path, line_start, line_end, list_path, indent, raw_text, text_norm, checked, status, priority, due_date, scheduled_date, start_date, completed_at, recurrence_rule, tags_json, project, section, source_hash, note_etag, note_updated, indexed_at)
             VALUES
             ('combined', 'work/todos.md', 'work/todos.md', 1, 1, '0', 0, 'Ship release ⏳ 2026-03-12 📅 2026-03-12', 'Ship release', 0, 'todo', 3, '2026-03-12', '2026-03-12', NULL, NULL, NULL, '[]', NULL, NULL, 'hash-1', 'etag', '2026-03-10T00:00:00Z', '2026-03-10T00:00:00Z'),
             ('split', 'work/todos.md', 'work/todos.md', 2, 2, '1', 0, 'Prep deck ⏳ 2026-03-11 📅 2026-03-14', 'Prep deck', 0, 'todo', 3, '2026-03-14', '2026-03-11', NULL, NULL, NULL, '[]', NULL, NULL, 'hash-2', 'etag', '2026-03-10T00:00:00Z', '2026-03-10T00:00:00Z')",
            [],
        )
        .unwrap();

        let result = load_calendar(
            &conn,
            &CalendarQueryRequest {
                mode: CalendarMode::Tasks,
                source: CalendarSource {
                    kind: CalendarSourceKind::Space,
                    path: None,
                    recursive: None,
                },
                start_date: "2026-03-01".to_string(),
                end_date: "2026-03-31".to_string(),
                note_date_property_key: None,
                note_date_property_kind: None,
                daily_notes_folder: None,
            },
        )
        .unwrap();

        assert_eq!(result.items.len(), 3);
        let combined = result
            .items
            .iter()
            .find(|item| item.id.contains("combined"))
            .unwrap();
        assert_eq!(combined.badges, vec!["Scheduled", "Due"]);
        assert_eq!(combined.title, "Ship release");
        assert_eq!(
            result
                .items
                .iter()
                .filter(|item| item.id.contains("split"))
                .count(),
            2
        );
    }
}
