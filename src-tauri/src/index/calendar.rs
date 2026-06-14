use std::collections::HashMap;

use chrono::{Days, NaiveDate};
use rusqlite::Connection;
use serde::Serialize;
use tauri::{State, WebviewWindow};

use crate::space::SpaceState;

use super::db::open_db;

#[derive(Clone, Copy, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CalendarNoteKind {
    Daily,
    Created,
    Edited,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDayActivity {
    pub date: String,
    pub has_daily_note: bool,
    pub has_created: bool,
    pub has_edited: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDateNote {
    pub path: String,
    pub title: String,
    pub kinds: Vec<CalendarNoteKind>,
}

#[derive(Clone)]
struct CalendarNoteEvent {
    date: String,
    path: String,
    title: String,
    kind: CalendarNoteKind,
}

fn parse_iso_date(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.len() != 10 {
        return Err(format!("Invalid ISO date: {value}"));
    }
    let bytes = trimmed.as_bytes();
    for (index, byte) in bytes.iter().enumerate() {
        let valid = match index {
            4 | 7 => *byte == b'-',
            _ => byte.is_ascii_digit(),
        };
        if !valid {
            return Err(format!("Invalid ISO date: {value}"));
        }
    }
    Ok(trimmed.to_string())
}

fn parse_iso_naive_date(value: &str) -> Result<NaiveDate, String> {
    let date = parse_iso_date(value)?;
    NaiveDate::parse_from_str(&date, "%Y-%m-%d").map_err(|_| format!("Invalid ISO date: {value}"))
}

fn date_key(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

fn expanded_date_prefilter(from_date: &str, to_date: &str) -> Result<(String, String), String> {
    let from = parse_iso_naive_date(from_date)?
        .checked_sub_days(Days::new(1))
        .ok_or_else(|| "from_date is out of range".to_string())?;
    let to = parse_iso_naive_date(to_date)?
        .checked_add_days(Days::new(1))
        .ok_or_else(|| "to_date is out of range".to_string())?;
    Ok((date_key(from), date_key(to)))
}

fn local_date_key_from_timestamp(value: &str) -> Option<String> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|parsed| date_key(parsed.with_timezone(&chrono::Local).date_naive()))
        .ok()
}

fn normalize_daily_note_folder(folder: Option<String>) -> Option<String> {
    folder
        .map(|value| value.trim().trim_matches('/').replace('\\', "/"))
        .filter(|value| !value.is_empty())
}

fn daily_note_path_for_date(folder: Option<&str>, date: &str) -> String {
    match folder.filter(|value| !value.is_empty()) {
        Some(folder) => format!("{folder}/{date}.md"),
        None => format!("{date}.md"),
    }
}

fn daily_note_glob(folder: Option<&str>) -> String {
    match folder.filter(|value| !value.is_empty()) {
        Some(folder) => format!("{folder}/????-??-??.md"),
        None => "????-??-??.md".to_string(),
    }
}

fn date_from_daily_note_path(path: &str) -> Option<String> {
    let normalized = path.replace('\\', "/");
    let stem = normalized.rsplit('/').next()?;
    let date = stem.strip_suffix(".md")?;
    parse_iso_date(date).ok()
}

fn collect_daily_note_events(
    conn: &Connection,
    from_date: &str,
    to_date: &str,
    daily_folder: Option<&str>,
    events: &mut Vec<CalendarNoteEvent>,
) -> Result<(), String> {
    let daily_glob = daily_note_glob(daily_folder);
    let mut stmt = conn
        .prepare("SELECT path, title FROM notes WHERE path GLOB ?")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([&daily_glob]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let path: String = row.get(0).map_err(|e| e.to_string())?;
        let Some(date) = date_from_daily_note_path(&path) else {
            continue;
        };
        if date.as_str() < from_date || date.as_str() > to_date {
            continue;
        }
        events.push(CalendarNoteEvent {
            date,
            path,
            title: row.get(1).map_err(|e| e.to_string())?,
            kind: CalendarNoteKind::Daily,
        });
    }
    Ok(())
}

fn collect_timestamp_events(
    conn: &Connection,
    timestamp_column: &str,
    kind: CalendarNoteKind,
    from_date: &str,
    to_date: &str,
    events: &mut Vec<CalendarNoteEvent>,
) -> Result<(), String> {
    let (prefilter_from_date, prefilter_to_date) = expanded_date_prefilter(from_date, to_date)?;
    let sql = format!(
        "SELECT path, title, {timestamp_column}
         FROM notes
         WHERE substr({timestamp_column}, 1, 10) BETWEEN ?1 AND ?2"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params![&prefilter_from_date, &prefilter_to_date])
        .map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let timestamp: String = row.get(2).map_err(|e| e.to_string())?;
        let Some(date) = local_date_key_from_timestamp(&timestamp) else {
            continue;
        };
        if date.as_str() < from_date || date.as_str() > to_date {
            continue;
        }
        events.push(CalendarNoteEvent {
            date,
            path: row.get(0).map_err(|e| e.to_string())?,
            title: row.get(1).map_err(|e| e.to_string())?,
            kind,
        });
    }
    Ok(())
}

fn query_calendar_events(
    conn: &Connection,
    from_date: &str,
    to_date: &str,
    daily_folder: Option<&str>,
) -> Result<Vec<CalendarNoteEvent>, String> {
    let mut events = Vec::new();
    collect_daily_note_events(conn, from_date, to_date, daily_folder, &mut events)?;
    collect_timestamp_events(
        conn,
        "created",
        CalendarNoteKind::Created,
        from_date,
        to_date,
        &mut events,
    )?;
    collect_timestamp_events(
        conn,
        "updated",
        CalendarNoteKind::Edited,
        from_date,
        to_date,
        &mut events,
    )?;
    Ok(events)
}

fn day_activity(date: &str) -> CalendarDayActivity {
    CalendarDayActivity {
        date: date.to_string(),
        has_daily_note: false,
        has_created: false,
        has_edited: false,
    }
}

fn mark_day_activity(day: &mut CalendarDayActivity, kind: CalendarNoteKind) {
    match kind {
        CalendarNoteKind::Daily => day.has_daily_note = true,
        CalendarNoteKind::Created => day.has_created = true,
        CalendarNoteKind::Edited => day.has_edited = true,
    }
}

fn query_calendar_activity(
    conn: &Connection,
    from_date: &str,
    to_date: &str,
    daily_folder: Option<&str>,
) -> Result<Vec<CalendarDayActivity>, String> {
    let mut days: HashMap<String, CalendarDayActivity> = HashMap::new();
    for event in query_calendar_events(conn, from_date, to_date, daily_folder)? {
        let day = days
            .entry(event.date.clone())
            .or_insert_with(|| day_activity(&event.date));
        mark_day_activity(day, event.kind);
    }
    let mut out: Vec<CalendarDayActivity> = days.into_values().collect();
    out.sort_by(|left, right| left.date.cmp(&right.date));
    Ok(out)
}

fn kind_sort_order(kind: CalendarNoteKind) -> u8 {
    match kind {
        CalendarNoteKind::Daily => 0,
        CalendarNoteKind::Created => 1,
        CalendarNoteKind::Edited => 2,
    }
}

fn query_calendar_notes_for_date(
    conn: &Connection,
    date: &str,
    daily_folder: Option<&str>,
) -> Result<Vec<CalendarDateNote>, String> {
    let daily_path = daily_note_path_for_date(daily_folder, date);
    let mut by_path: HashMap<String, CalendarDateNote> = HashMap::new();

    for event in query_calendar_events(conn, date, date, daily_folder)? {
        let entry = by_path
            .entry(event.path.clone())
            .or_insert_with(|| CalendarDateNote {
                path: event.path,
                title: event.title,
                kinds: Vec::new(),
            });
        if !entry.kinds.contains(&event.kind) {
            entry.kinds.push(event.kind);
        }
    }

    let mut out: Vec<CalendarDateNote> = by_path.into_values().collect();
    for note in &mut out {
        note.kinds.sort_by_key(|kind| kind_sort_order(*kind));
    }
    out.sort_by(|left, right| {
        let left_daily = left.path == daily_path || left.kinds.contains(&CalendarNoteKind::Daily);
        let right_daily =
            right.path == daily_path || right.kinds.contains(&CalendarNoteKind::Daily);
        right_daily
            .cmp(&left_daily)
            .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
            .then_with(|| left.path.cmp(&right.path))
    });
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn index_calendar_activity(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    from_date: String,
    to_date: String,
    daily_note_folder: Option<String>,
) -> Result<Vec<CalendarDayActivity>, String> {
    let from_date = parse_iso_date(&from_date)?;
    let to_date = parse_iso_date(&to_date)?;
    if from_date > to_date {
        return Err("from_date must be on or before to_date".to_string());
    }
    let root = state.root_for_window(&window)?;
    let daily_note_folder = normalize_daily_note_folder(daily_note_folder);
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<CalendarDayActivity>, String> {
        let conn = open_db(&root)?;
        query_calendar_activity(&conn, &from_date, &to_date, daily_note_folder.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn index_calendar_notes_for_date(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    date: String,
    daily_note_folder: Option<String>,
) -> Result<Vec<CalendarDateNote>, String> {
    let date = parse_iso_date(&date)?;
    let root = state.root_for_window(&window)?;
    let daily_note_folder = normalize_daily_note_folder(daily_note_folder);
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<CalendarDateNote>, String> {
        let conn = open_db(&root)?;
        query_calendar_notes_for_date(&conn, &date, daily_note_folder.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}
