use std::collections::{HashMap, HashSet};
use std::path::Path;

use chrono::{DateTime, Duration, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State, WebviewWindow};

use crate::space::state::mark_recent_local_change;
use crate::space::SpaceState;

use super::db::open_db;
use super::indexer::index_note;
use super::indexer::rebuild;
use super::relationships::{query_note_relationships, NoteRelationship};
use super::search_advanced::{run_search_advanced, SearchAdvancedRequest};
use super::search_hybrid::hybrid_search;
use super::tags::{people_tag_to_handle, tag_depth, PEOPLE_TAG_NAMESPACE};
use super::tasks::{
    mutate_task_line, note_abs_path, query_note_task_summaries, summarize_tasks, write_note,
    IndexedTask, NoteTaskSummary, NoteTaskSummaryItem,
};
use super::types::{
    BacklinkItem, IndexRebuildResult, LocalGraphEdge, LocalGraphNode, LocalGraphTagEdge,
    LocalGraphTagNode, LocalNoteGraph, PersonCount, SearchResult, SpaceGraph, SpaceGraphEdge,
    SpaceGraphNode, SpaceGraphTagEdge, SpaceGraphTagNode, TagCount, TaskDateInfo,
};
use crate::index::{people_mentions_as_tags_enabled, set_people_mentions_as_tags_enabled};

#[derive(Serialize, Clone)]
struct NoteChangeEvent {
    space_path: String,
    rel_path: String,
    removed: bool,
}

#[derive(Serialize)]
pub struct CalendarDaySummary {
    pub date: String,
    pub task_count: u32,
    pub note_activity_count: u32,
    pub has_daily_note: bool,
    pub needs_daily_note_setup: bool,
}

#[derive(Serialize)]
pub struct AllDocsItem {
    pub note_path: String,
    pub title: String,
    pub preview: String,
    pub updated: String,
    pub created: String,
    pub tags: Vec<String>,
    pub people: Vec<String>,
}

#[derive(Serialize)]
pub struct CalendarNoteActivityItem {
    pub note_id: String,
    pub note_path: String,
    pub title: String,
    pub preview: Option<String>,
    pub tags: Vec<String>,
    pub created: String,
    pub updated: String,
    pub created_on_day: bool,
    pub edited_on_day: bool,
}

#[derive(Serialize)]
pub struct CalendarDayDetail {
    pub selected_date: String,
    pub note_activity: Vec<CalendarNoteActivityItem>,
    pub daily_note_path: Option<String>,
    pub has_daily_note: bool,
    pub daily_note_configured: bool,
}

#[derive(Serialize)]
pub struct CalendarTaskGroups {
    pub overdue: Vec<IndexedTask>,
    pub for_day: Vec<IndexedTask>,
    pub ongoing: Vec<IndexedTask>,
}

#[derive(Serialize)]
pub struct CalendarRangeResponse {
    pub days: Vec<CalendarDaySummary>,
    pub detail: CalendarDayDetail,
    pub tasks: CalendarTaskGroups,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GlobalTaskFilter {
    Today,
    Overdue,
    Inbox,
    NoDate,
    All,
}

impl GlobalTaskFilter {
    fn as_str(self) -> &'static str {
        match self {
            Self::Today => "today",
            Self::Overdue => "overdue",
            Self::Inbox => "inbox",
            Self::NoDate => "no_date",
            Self::All => "all",
        }
    }
}

fn tokenize_search_query(raw: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut cur = String::new();
    let mut in_quotes = false;
    for ch in raw.chars() {
        if ch == '"' {
            in_quotes = !in_quotes;
            continue;
        }
        if ch.is_whitespace() && !in_quotes {
            if !cur.trim().is_empty() {
                out.push(cur.trim().to_string());
            }
            cur.clear();
            continue;
        }
        cur.push(ch);
    }
    if !cur.trim().is_empty() {
        out.push(cur.trim().to_string());
    }
    out
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

pub(crate) fn parse_raw_search_query(raw_query: &str, limit: Option<u32>) -> SearchAdvancedRequest {
    let mut req = SearchAdvancedRequest {
        limit: Some(limit.unwrap_or(1500).clamp(1, 2_000)),
        ..SearchAdvancedRequest::default()
    };
    let mut tags: Vec<String> = Vec::new();
    let mut people: Vec<String> = Vec::new();
    let mut text_parts: Vec<String> = Vec::new();

    for token in tokenize_search_query(raw_query.trim()) {
        let lower = token.to_lowercase();
        if lower == "title:only" {
            req.title_only = true;
            continue;
        }
        if lower == "tag:only" {
            req.tag_only = true;
            continue;
        }
        if token.starts_with('#') {
            tags.push(token);
            continue;
        }
        if people_mentions_as_tags_enabled() && token.starts_with('@') {
            people.push(token);
            continue;
        }
        if lower.starts_with("tag:") {
            let rest = token[4..].trim();
            if !rest.is_empty() {
                tags.push(if rest.starts_with('#') {
                    rest.to_string()
                } else {
                    format!("#{rest}")
                });
            }
            continue;
        }
        if people_mentions_as_tags_enabled() && lower.starts_with("person:") {
            let rest = token[7..].trim();
            if !rest.is_empty() {
                people.push(if rest.starts_with('@') {
                    rest.to_string()
                } else {
                    format!("@{rest}")
                });
            }
            continue;
        }
        text_parts.push(token);
    }

    req.tags = tags;
    req.people = people;
    let text = text_parts.join(" ").trim().to_string();
    req.query = if text.is_empty() { None } else { Some(text) };
    req
}

fn task_line_parts(line: &str) -> Option<(&str, &str)> {
    let trimmed = line.trim_start();
    let list_prefix = [
        "- [ ] ", "- [x] ", "- [X] ", "* [ ] ", "* [x] ", "* [X] ", "+ [ ] ", "+ [x] ", "+ [X] ",
    ];
    for prefix in list_prefix {
        if trimmed.starts_with(prefix) {
            let head_offset = line.len() - trimmed.len();
            let split_at = head_offset + prefix.len();
            return Some((&line[..split_at], &line[split_at..]));
        }
    }
    None
}

fn is_iso_date(v: &str) -> bool {
    let b = v.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b.iter()
            .enumerate()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

fn parse_task_dates(body: &str) -> (String, String) {
    let tokens: Vec<&str> = body.split_whitespace().collect();
    let mut scheduled_date = String::new();
    let mut due_date = String::new();
    for i in 0..tokens.len() {
        let next = tokens.get(i + 1).copied().unwrap_or("");
        if tokens[i] == "⏳" && is_iso_date(next) {
            scheduled_date = next.to_string();
        }
        if tokens[i] == "📅" && is_iso_date(next) {
            due_date = next.to_string();
        }
    }
    (scheduled_date, due_date)
}

fn parse_calendar_date(date: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|_| format!("invalid calendar date: {date}"))
}

fn format_calendar_date(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

fn calendar_date_for_timestamp(value: &str) -> String {
    DateTime::parse_from_rfc3339(value)
        .map(|timestamp| format_calendar_date(timestamp.with_timezone(&Local).date_naive()))
        .unwrap_or_else(|_| value.get(0..10).unwrap_or_default().to_string())
}

fn daily_note_path_for(folder: Option<&str>, date: &str) -> Option<String> {
    let folder = folder?.trim().trim_matches('/').replace('\\', "/");
    if folder.is_empty() {
        return Some(format!("{date}.md"));
    }
    Some(format!("{folder}/{date}.md"))
}

fn sort_calendar_tasks(tasks: &mut [IndexedTask]) {
    tasks.sort_by(|left, right| {
        left.scheduled_date
            .as_deref()
            .unwrap_or(left.due_date.as_deref().unwrap_or("9999-12-31"))
            .cmp(
                right
                    .scheduled_date
                    .as_deref()
                    .unwrap_or(right.due_date.as_deref().unwrap_or("9999-12-31")),
            )
            .then_with(|| left.due_date.cmp(&right.due_date))
            .then_with(|| left.note_title.cmp(&right.note_title))
            .then_with(|| left.line_start.cmp(&right.line_start))
    });
}

fn indexed_task_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<IndexedTask> {
    Ok(IndexedTask {
        task_id: row.get(0)?,
        note_id: row.get(1)?,
        note_title: row.get(2)?,
        note_path: row.get(3)?,
        line_start: row.get(4)?,
        raw_text: row.get(5)?,
        checked: row.get::<_, i64>(6)? == 1,
        status: row.get(7)?,
        priority: row.get(8)?,
        due_date: row.get(9)?,
        scheduled_date: row.get(10)?,
        section: row.get(11)?,
        note_updated: row.get(12)?,
    })
}

fn normalized_task_query_date(today_date: Option<String>) -> Result<String, String> {
    let Some(today_date) = today_date
        .map(|date| date.trim().to_string())
        .filter(|date| !date.is_empty())
    else {
        return Ok(format_calendar_date(Local::now().date_naive()));
    };

    parse_calendar_date(&today_date).map(format_calendar_date)
}

fn rewrite_task_dates(body: &str, scheduled_date: &str, due_date: &str) -> String {
    let tokens: Vec<&str> = body.split_whitespace().collect();
    let mut kept: Vec<&str> = Vec::new();
    let mut i = 0usize;
    while i < tokens.len() {
        let next = tokens.get(i + 1).copied().unwrap_or("");
        if (tokens[i] == "⏳" || tokens[i] == "📅") && is_iso_date(next) {
            i += 2;
            continue;
        }
        kept.push(tokens[i]);
        i += 1;
    }
    let mut out = kept.join(" ");
    if !scheduled_date.is_empty() {
        out = if out.is_empty() {
            format!("⏳ {scheduled_date}")
        } else {
            format!("{out} ⏳ {scheduled_date}")
        };
    }
    if !due_date.is_empty() {
        out = if out.is_empty() {
            format!("📅 {due_date}")
        } else {
            format!("{out} 📅 {due_date}")
        };
    }
    out.trim().to_string()
}

#[tauri::command]
pub async fn index_rebuild(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
) -> Result<IndexRebuildResult, String> {
    let root = state.root_for_window(&window)?;
    let res = tauri::async_runtime::spawn_blocking(move || rebuild(&root))
        .await
        .map_err(|e| e.to_string())??;
    Ok(res)
}

#[tauri::command]
pub async fn search(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<SearchResult>, String> {
        let conn = open_db(&root)?;
        hybrid_search(&conn, &query, &[], 50)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn search_advanced(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    request: SearchAdvancedRequest,
) -> Result<Vec<SearchResult>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<SearchResult>, String> {
        let conn = open_db(&root)?;
        run_search_advanced(&conn, request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn search_parse_and_run(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    raw_query: String,
    limit: Option<u32>,
) -> Result<Vec<SearchResult>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<SearchResult>, String> {
        let req = parse_raw_search_query(&raw_query, limit);
        let conn = open_db(&root)?;
        run_search_advanced(&conn, req)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn index_set_people_mentions_as_tags_enabled(enabled: bool) -> Result<(), String> {
    set_people_mentions_as_tags_enabled(enabled);
    Ok(())
}

#[tauri::command]
pub async fn all_docs_list(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    limit: Option<u32>,
    folder_prefix: Option<String>,
) -> Result<Vec<AllDocsItem>, String> {
    let root = state.root_for_window(&window)?;
    let limit = limit.unwrap_or(2_000).clamp(1, 5_000) as i64;
    let folder_prefix = folder_prefix
        .map(|value| value.trim().trim_matches('/').replace('\\', "/"))
        .filter(|value| !value.is_empty());
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<AllDocsItem>, String> {
        let conn = open_db(&root)?;
        let mut sql = String::from(
            "WITH visible_notes AS (
                 SELECT n.id, n.path, n.title, n.preview, n.updated, n.created
                 FROM notes n ",
        );
        let mut params: Vec<rusqlite::types::Value> = Vec::new();
        if let Some(prefix) = folder_prefix.as_ref() {
            sql.push_str("WHERE n.path LIKE ? ESCAPE '\\' ");
            params.push(rusqlite::types::Value::from(format!(
                "{}/%",
                escape_like(prefix)
            )));
        }
        sql.push_str(
            "ORDER BY n.updated DESC LIMIT ?
             ),
             tag_blob AS (
                 SELECT ordered_tags.note_id, GROUP_CONCAT(ordered_tags.tag, '\n') AS tags
                 FROM (
                     SELECT t.note_id, t.tag, t.is_explicit
                     FROM tags t
                     JOIN visible_notes vn ON vn.id = t.note_id
                     WHERE t.tag NOT LIKE 'people/%'
                     ORDER BY t.note_id, t.is_explicit DESC, t.tag COLLATE NOCASE ASC
                 ) ordered_tags
                 GROUP BY ordered_tags.note_id
             ),
             people_blob AS (
                 SELECT ordered_people.note_id, GROUP_CONCAT(ordered_people.tag, '\n') AS people
                 FROM (
                     SELECT t.note_id, t.tag
                     FROM tags t
                     JOIN visible_notes vn ON vn.id = t.note_id
                     WHERE t.tag LIKE 'people/%'
                     ORDER BY t.note_id, t.tag COLLATE NOCASE ASC
                 ) ordered_people
                 GROUP BY ordered_people.note_id
             )
             SELECT vn.path, vn.title, vn.preview, vn.updated, vn.created,
                    COALESCE(tag_blob.tags, ''), COALESCE(people_blob.people, '')
             FROM visible_notes vn
             LEFT JOIN tag_blob ON tag_blob.note_id = vn.id
             LEFT JOIN people_blob ON people_blob.note_id = vn.id
             ORDER BY vn.updated DESC",
        );
        params.push(rusqlite::types::Value::from(limit));
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(rusqlite::params_from_iter(params.iter()))
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let tag_blob: String = row.get(5).map_err(|e| e.to_string())?;
            let people_blob: String = row.get(6).map_err(|e| e.to_string())?;
            out.push(AllDocsItem {
                note_path: row.get(0).map_err(|e| e.to_string())?,
                title: row.get(1).map_err(|e| e.to_string())?,
                preview: row.get(2).map_err(|e| e.to_string())?,
                updated: row.get(3).map_err(|e| e.to_string())?,
                created: row.get(4).map_err(|e| e.to_string())?,
                tags: tag_blob
                    .split('\n')
                    .map(str::trim)
                    .filter(|tag| !tag.is_empty())
                    .map(ToOwned::to_owned)
                    .collect(),
                people: people_blob
                    .split('\n')
                    .filter_map(people_tag_to_handle)
                    .collect(),
            });
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn all_docs_count(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    folder_prefix: Option<String>,
) -> Result<u32, String> {
    let root = state.root_for_window(&window)?;
    let folder_prefix = folder_prefix
        .map(|value| value.trim().trim_matches('/').replace('\\', "/"))
        .filter(|value| !value.is_empty());
    tauri::async_runtime::spawn_blocking(move || -> Result<u32, String> {
        let conn = open_db(&root)?;
        let mut sql = String::from("SELECT COUNT(*) FROM notes n ");
        let mut params: Vec<rusqlite::types::Value> = Vec::new();
        if let Some(prefix) = folder_prefix.as_ref() {
            sql.push_str("WHERE n.path LIKE ? ESCAPE '\\' ");
            params.push(rusqlite::types::Value::from(format!(
                "{}/%",
                escape_like(prefix)
            )));
        }
        let count: i64 = conn
            .query_row(&sql, rusqlite::params_from_iter(params.iter()), |row| {
                row.get(0)
            })
            .map_err(|e| e.to_string())?;
        Ok(count.max(0) as u32)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn calendar_query_range(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    start_date: String,
    end_date: String,
    selected_date: String,
    daily_notes_folder: Option<String>,
) -> Result<CalendarRangeResponse, String> {
    let root = state.root_for_window(&window)?;
    let start = parse_calendar_date(&start_date)?;
    let end = parse_calendar_date(&end_date)?;
    let selected = parse_calendar_date(&selected_date)?;
    if end < start {
        return Err("end_date must be on or after start_date".to_string());
    }
    if selected < start || selected > end {
        return Err("selected_date must be inside the requested range".to_string());
    }
    let normalized_daily_notes_folder = daily_notes_folder
        .map(|folder| folder.trim().trim_matches('/').replace('\\', "/"))
        .filter(|folder| !folder.is_empty());

    tauri::async_runtime::spawn_blocking(move || -> Result<CalendarRangeResponse, String> {
        let conn = open_db(&root)?;

        let mut days = Vec::new();
        let mut task_counts = HashMap::<String, u32>::new();
        let mut note_activity_sets = HashMap::<String, HashSet<String>>::new();
        let mut current = start;
        while current <= end {
            days.push(format_calendar_date(current));
            current += Duration::days(1);
        }

        let mut task_stmt = conn
            .prepare(
                "SELECT t.task_id, t.note_id, n.title, t.note_path, t.line_start, t.raw_text, t.checked,
                        t.status, t.priority, t.due_date, t.scheduled_date, t.section, t.note_updated
                 FROM tasks t
                 JOIN notes n ON n.id = t.note_id
                 WHERE t.checked = 0
                   AND (t.scheduled_date IS NOT NULL OR t.due_date IS NOT NULL)
                   AND (
                        (
                            COALESCE(t.scheduled_date, t.due_date) <= ?3
                            AND COALESCE(t.due_date, t.scheduled_date) >= ?1
                        )
                        OR COALESCE(t.due_date, t.scheduled_date) < ?2
                   )",
            )
            .map_err(|e| e.to_string())?;
        let mut task_rows = task_stmt
            .query([start_date.as_str(), selected_date.as_str(), end_date.as_str()])
            .map_err(|e| e.to_string())?;
        let mut all_tasks = Vec::<IndexedTask>::new();
        while let Some(row) = task_rows.next().map_err(|e| e.to_string())? {
            all_tasks.push(IndexedTask {
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

        for task in &all_tasks {
            let Some(start_bound) = task
                .scheduled_date
                .as_deref()
                .or(task.due_date.as_deref())
                .and_then(|date| parse_calendar_date(date).ok())
            else {
                continue;
            };
            let end_bound = task
                .due_date
                .as_deref()
                .or(task.scheduled_date.as_deref())
                .and_then(|date| parse_calendar_date(date).ok())
                .unwrap_or(start_bound);
            let overlap_start = start_bound.max(start);
            let overlap_end = end_bound.min(end);
            if overlap_start > overlap_end {
                continue;
            }
            let mut day = overlap_start;
            while day <= overlap_end {
                *task_counts.entry(format_calendar_date(day)).or_insert(0) += 1;
                day += Duration::days(1);
            }
        }

        let note_prefilter_start = format_calendar_date(start - Duration::days(1));
        let note_prefilter_end = format_calendar_date(end + Duration::days(1));
        let mut note_stmt = conn
            .prepare(
                "SELECT id, title, path, preview, created, updated,
                        COALESCE(
                            (
                                SELECT GROUP_CONCAT(tag, '\n')
                                FROM tags
                                WHERE note_id = notes.id
                                  AND is_explicit = 1
                                  AND tag NOT LIKE 'people/%'
                            ),
                            ''
                        ) AS tags
                 FROM notes
                 WHERE substr(created, 1, 10) BETWEEN ? AND ?
                    OR substr(updated, 1, 10) BETWEEN ? AND ?",
            )
            .map_err(|e| e.to_string())?;
        let mut note_rows = note_stmt
            .query([
                note_prefilter_start.as_str(),
                note_prefilter_end.as_str(),
                note_prefilter_start.as_str(),
                note_prefilter_end.as_str(),
            ])
            .map_err(|e| e.to_string())?;

        let mut note_activity = Vec::<CalendarNoteActivityItem>::new();
        while let Some(row) = note_rows.next().map_err(|e| e.to_string())? {
            let note_id: String = row.get(0).map_err(|e| e.to_string())?;
            let title: String = row.get(1).map_err(|e| e.to_string())?;
            let note_path: String = row.get(2).map_err(|e| e.to_string())?;
            let preview: Option<String> = row.get(3).map_err(|e| e.to_string())?;
            let created: String = row.get(4).map_err(|e| e.to_string())?;
            let updated: String = row.get(5).map_err(|e| e.to_string())?;
            let tags_raw: String = row.get(6).map_err(|e| e.to_string())?;
            let tags = tags_raw
                .split('\n')
                .map(str::trim)
                .filter(|tag| !tag.is_empty())
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>();
            let created_day = calendar_date_for_timestamp(&created);
            let updated_day = calendar_date_for_timestamp(&updated);
            let is_created_daily_note = daily_note_path_for(
                normalized_daily_notes_folder.as_deref(),
                &created_day,
            )
            .as_deref()
                == Some(note_path.as_str());
            let is_updated_daily_note = daily_note_path_for(
                normalized_daily_notes_folder.as_deref(),
                &updated_day,
            )
            .as_deref()
                == Some(note_path.as_str());

            if created_day >= start_date && created_day <= end_date && !is_created_daily_note {
                note_activity_sets
                    .entry(created_day.clone())
                    .or_default()
                    .insert(note_id.clone());
            }
            if updated_day >= start_date && updated_day <= end_date && !is_updated_daily_note {
                note_activity_sets
                    .entry(updated_day.clone())
                    .or_default()
                    .insert(note_id.clone());
            }

            let created_on_day = created_day == selected_date;
            let edited_on_day = updated_day == selected_date;
            if !created_on_day && !edited_on_day {
                continue;
            }
            note_activity.push(CalendarNoteActivityItem {
                note_id,
                note_path,
                title,
                preview,
                tags,
                created,
                updated,
                created_on_day,
                edited_on_day,
            });
        }

        let mut daily_note_exists_by_date = HashMap::<String, bool>::new();
        if normalized_daily_notes_folder.is_some() {
            for date in &days {
                let Some(path) = daily_note_path_for(normalized_daily_notes_folder.as_deref(), date) else {
                    continue;
                };
                let exists = conn
                    .query_row("SELECT 1 FROM notes WHERE id = ? LIMIT 1", [path.as_str()], |row| {
                        row.get::<_, i64>(0)
                    })
                    .map(|_| true)
                    .unwrap_or(false);
                daily_note_exists_by_date.insert(date.clone(), exists);
            }
        }

        let selected_daily_note_path =
            daily_note_path_for(normalized_daily_notes_folder.as_deref(), &selected_date);
        if let Some(daily_note_path) = selected_daily_note_path.as_ref() {
            note_activity.retain(|item| item.note_path != *daily_note_path);
        }
        note_activity.sort_by(|left, right| {
            let left_sort = if left.edited_on_day {
                left.updated.as_str()
            } else {
                left.created.as_str()
            };
            let right_sort = if right.edited_on_day {
                right.updated.as_str()
            } else {
                right.created.as_str()
            };
            right_sort
                .cmp(left_sort)
                .then_with(|| left.title.cmp(&right.title))
        });

        let mut overdue = Vec::new();
        let mut for_day = Vec::new();
        let mut ongoing = Vec::new();
        for task in all_tasks {
            let scheduled = task.scheduled_date.as_deref();
            let due = task.due_date.as_deref();
            let is_overdue = due.is_some_and(|date| date < selected_date.as_str());
            let is_for_day = scheduled == Some(selected_date.as_str()) || due == Some(selected_date.as_str());
            let is_ongoing = scheduled.is_some_and(|date| date < selected_date.as_str())
                && !is_for_day
                && !is_overdue
                && due.is_none_or(|date| date > selected_date.as_str());
            if is_overdue {
                overdue.push(task);
                continue;
            }
            if is_for_day {
                for_day.push(task);
                continue;
            }
            if is_ongoing {
                ongoing.push(task);
            }
        }
        sort_calendar_tasks(&mut overdue);
        sort_calendar_tasks(&mut for_day);
        sort_calendar_tasks(&mut ongoing);

        let summaries = days
            .into_iter()
            .map(|date| CalendarDaySummary {
                task_count: task_counts.get(&date).copied().unwrap_or(0),
                note_activity_count: note_activity_sets
                    .get(&date)
                    .map(|entries| entries.len() as u32)
                    .unwrap_or(0),
                has_daily_note: daily_note_exists_by_date.get(&date).copied().unwrap_or(false),
                needs_daily_note_setup: normalized_daily_notes_folder.is_none(),
                date,
            })
            .collect::<Vec<_>>();

        Ok(CalendarRangeResponse {
            days: summaries,
            detail: CalendarDayDetail {
                selected_date: selected_date.clone(),
                note_activity,
                daily_note_path: selected_daily_note_path,
                has_daily_note: daily_note_exists_by_date
                    .get(&selected_date)
                    .copied()
                    .unwrap_or(false),
                daily_note_configured: normalized_daily_notes_folder.is_some(),
            },
            tasks: CalendarTaskGroups {
                overdue,
                for_day,
                ongoing,
            },
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn tags_list(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<TagCount>, String> {
    let root = state.root_for_window(&window)?;
    let limit = limit.unwrap_or(200).min(2000) as i64;
    let offset = offset.unwrap_or(0) as i64;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<TagCount>, String> {
        let conn = open_db(&root)?;
        list_tags(&conn, limit, offset)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn list_tags(
    conn: &rusqlite::Connection,
    limit: i64,
    offset: i64,
) -> Result<Vec<TagCount>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT tag,
                    SUM(CASE WHEN is_explicit = 1 THEN 1 ELSE 0 END) AS direct_count,
                    COUNT(*) AS total_count,
                    MAX(is_explicit) AS is_explicit
             FROM tags
             WHERE tag NOT LIKE 'people/%'
             GROUP BY tag
             ORDER BY tag ASC
             LIMIT ? OFFSET ?",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params![limit, offset])
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let tag = row.get::<_, String>(0).map_err(|e| e.to_string())?;
        out.push(TagCount {
            depth: tag_depth(&tag) as u32,
            direct_count: row.get::<_, i64>(1).map_err(|e| e.to_string())? as u32,
            total_count: row.get::<_, i64>(2).map_err(|e| e.to_string())? as u32,
            is_explicit: row.get::<_, i64>(3).map_err(|e| e.to_string())? > 0,
            tag,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn people_list(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<PersonCount>, String> {
    let root = state.root_for_window(&window)?;
    let limit = limit.unwrap_or(200).min(2000) as i64;
    let offset = offset.unwrap_or(0) as i64;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<PersonCount>, String> {
        let conn = open_db(&root)?;
        list_people(&conn, limit, offset)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn list_people(
    conn: &rusqlite::Connection,
    limit: i64,
    offset: i64,
) -> Result<Vec<PersonCount>, String> {
    if !people_mentions_as_tags_enabled() {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "SELECT tag, COUNT(*) AS total_count
             FROM tags
             WHERE tag LIKE ? AND is_explicit = 1
             GROUP BY tag
             ORDER BY tag ASC
             LIMIT ? OFFSET ?",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params![
            format!("{PEOPLE_TAG_NAMESPACE}%"),
            limit,
            offset
        ])
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let tag = row.get::<_, String>(0).map_err(|e| e.to_string())?;
        let Some(handle) = people_tag_to_handle(&tag) else {
            continue;
        };
        out.push(PersonCount {
            handle,
            count: row.get::<_, i64>(1).map_err(|e| e.to_string())? as u32,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::index::schema::ensure_schema;
    use crate::index::set_people_mentions_as_tags_enabled;
    use crate::index::tags::{expand_indexed_people, expand_indexed_tags};

    use super::{list_people, list_tags};

    #[test]
    fn list_tags_reports_direct_and_total_counts_for_virtual_parents() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        for tag in expand_indexed_tags(&["work/today/further".to_string()]) {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, ?, ?)",
                rusqlite::params![
                    "notes/leaf.md",
                    tag.tag,
                    if tag.is_explicit { 1 } else { 0 }
                ],
            )
            .unwrap();
        }
        for tag in expand_indexed_tags(&["work".to_string()]) {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, ?, ?)",
                rusqlite::params![
                    "notes/root.md",
                    tag.tag,
                    if tag.is_explicit { 1 } else { 0 }
                ],
            )
            .unwrap();
        }

        let tags = list_tags(&conn, 50, 0).unwrap();
        assert_eq!(tags.len(), 3);

        let root = tags.iter().find(|tag| tag.tag == "work").unwrap();
        assert_eq!(root.direct_count, 1);
        assert_eq!(root.total_count, 2);
        assert!(root.is_explicit);
        assert_eq!(root.depth, 0);

        let intermediate = tags.iter().find(|tag| tag.tag == "work/today").unwrap();
        assert_eq!(intermediate.direct_count, 0);
        assert_eq!(intermediate.total_count, 1);
        assert!(!intermediate.is_explicit);
        assert_eq!(intermediate.depth, 1);
    }

    #[test]
    fn list_tags_excludes_people_namespace_and_people_list_strips_prefix() {
        set_people_mentions_as_tags_enabled(true);
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        for tag in expand_indexed_tags(&["work".to_string()]) {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, ?, ?)",
                rusqlite::params![
                    "notes/work.md",
                    tag.tag,
                    if tag.is_explicit { 1 } else { 0 }
                ],
            )
            .unwrap();
        }
        for tag in expand_indexed_people(&["alice".to_string()]) {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, ?, ?)",
                rusqlite::params![
                    "notes/person.md",
                    tag.tag,
                    if tag.is_explicit { 1 } else { 0 }
                ],
            )
            .unwrap();
        }

        let tags = list_tags(&conn, 50, 0).unwrap();
        assert_eq!(
            tags.iter().map(|tag| tag.tag.as_str()).collect::<Vec<_>>(),
            vec!["work"]
        );

        let people = list_people(&conn, 50, 0).unwrap();
        assert_eq!(people.len(), 1);
        assert_eq!(people[0].handle, "alice");
        assert_eq!(people[0].count, 1);
        set_people_mentions_as_tags_enabled(false);
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn task_set_checked(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    task_id: String,
    checked: bool,
) -> Result<(), String> {
    let root = state.root_for_window(&window)?;
    let space_path = root.to_string_lossy().to_string();
    let window_label = window.label().to_string();
    let recent_local_changes = state.recent_local_changes_for_window(window.label());
    let note_path = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let conn = open_db(&root)?;
        let mut stmt = conn
            .prepare("SELECT note_id, note_path, line_start FROM tasks WHERE task_id = ? LIMIT 1")
            .map_err(|e| e.to_string())?;
        let (note_id, note_path, line_start): (String, String, i64) = stmt
            .query_row([task_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .map_err(|e| e.to_string())?;

        let abs = note_abs_path(&root, &note_path)?;
        let markdown = std::fs::read_to_string(&abs).map_err(|e| e.to_string())?;
        let next = mutate_task_line(&markdown, line_start, Some(checked), None, None)
            .ok_or_else(|| "task line no longer exists".to_string())?;
        mark_recent_local_change(&recent_local_changes, &note_path);
        write_note(&abs, &next)?;
        let _ = index_note(&root, &note_id, &next);
        Ok(note_path)
    })
    .await
    .map_err(|e| e.to_string())??;
    let _ = app.emit_to(
        window_label,
        "notes:external_changed",
        NoteChangeEvent {
            space_path,
            rel_path: note_path,
            removed: false,
        },
    );
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn tasks_query_global(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    filter: Option<GlobalTaskFilter>,
    today_date: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<IndexedTask>, String> {
    let root = state.root_for_window(&window)?;
    let filter = filter.unwrap_or(GlobalTaskFilter::All).as_str().to_string();
    let today_date = normalized_task_query_date(today_date)?;
    let limit = limit.unwrap_or(500).clamp(1, 2_000) as i64;

    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<IndexedTask>, String> {
        let conn = open_db(&root)?;
        let mut stmt = conn
            .prepare(
                "SELECT t.task_id, t.note_id, n.title, t.note_path, t.line_start, t.raw_text, t.checked,
                        t.status, t.priority, t.due_date, t.scheduled_date, t.section, t.note_updated
                 FROM tasks t
                 JOIN notes n ON n.id = t.note_id
                 WHERE t.checked = 0
                   AND (
                        ?1 = 'all'
                        OR (?1 = 'today' AND (t.scheduled_date = ?2 OR t.due_date = ?2))
                        OR (?1 = 'overdue' AND t.due_date IS NOT NULL AND t.due_date < ?2)
                        OR (
                            ?1 = 'inbox'
                            AND (
                                lower(t.raw_text) = '#inbox'
                                OR lower(t.raw_text) GLOB '#inbox[^abcdefghijklmnopqrstuvwxyz0123456789_/-]*'
                                OR lower(t.raw_text) GLOB ('*[ ' || char(9) || char(10) || char(11) || char(12) || char(13) || ']#inbox')
                                OR lower(t.raw_text) GLOB ('*[ ' || char(9) || char(10) || char(11) || char(12) || char(13) || ']#inbox[^abcdefghijklmnopqrstuvwxyz0123456789_/-]*')
                            )
                        )
                        OR (?1 = 'no_date' AND t.scheduled_date IS NULL AND t.due_date IS NULL)
                   )
                 ORDER BY
                    CASE WHEN ?1 IN ('inbox', 'no_date') THEN t.note_updated ELSE '' END DESC,
                    COALESCE(t.scheduled_date, t.due_date, '9999-12-31') ASC,
                    COALESCE(t.due_date, t.scheduled_date, '9999-12-31') ASC,
                    t.priority ASC,
                    n.title COLLATE NOCASE ASC,
                    t.line_start ASC
                 LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(rusqlite::params![filter, today_date, limit])
            .map_err(|e| e.to_string())?;
        let mut tasks = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            tasks.push(indexed_task_from_row(row).map_err(|e| e.to_string())?);
        }
        Ok(tasks)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn task_set_dates(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    task_id: String,
    scheduled_date: Option<String>,
    due_date: Option<String>,
) -> Result<(), String> {
    let root = state.root_for_window(&window)?;
    let space_path = root.to_string_lossy().to_string();
    let window_label = window.label().to_string();
    let recent_local_changes = state.recent_local_changes_for_window(window.label());
    let note_path = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let conn = open_db(&root)?;
        let mut stmt = conn
            .prepare("SELECT note_id, note_path, line_start FROM tasks WHERE task_id = ? LIMIT 1")
            .map_err(|e| e.to_string())?;
        let (note_id, note_path, line_start): (String, String, i64) = stmt
            .query_row([task_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .map_err(|e| e.to_string())?;

        let abs = note_abs_path(&root, &note_path)?;
        let markdown = std::fs::read_to_string(&abs).map_err(|e| e.to_string())?;
        let next = mutate_task_line(
            &markdown,
            line_start,
            None,
            scheduled_date.as_deref(),
            due_date.as_deref(),
        )
        .ok_or_else(|| "task line no longer exists".to_string())?;
        mark_recent_local_change(&recent_local_changes, &note_path);
        write_note(&abs, &next)?;
        let _ = index_note(&root, &note_id, &next);
        Ok(note_path)
    })
    .await
    .map_err(|e| e.to_string())??;
    let _ = app.emit_to(
        window_label,
        "notes:external_changed",
        NoteChangeEvent {
            space_path,
            rel_path: note_path,
            removed: false,
        },
    );
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn task_dates_by_ordinal(markdown: String, ordinal: u32) -> Option<TaskDateInfo> {
    let mut idx = 0u32;
    for line in markdown.lines() {
        let Some((_prefix, body)) = task_line_parts(line) else {
            continue;
        };
        if idx == ordinal {
            let (scheduled_date, due_date) = parse_task_dates(body);
            return Some(TaskDateInfo {
                scheduled_date,
                due_date,
            });
        }
        idx += 1;
    }
    None
}

#[tauri::command(rename_all = "snake_case")]
pub fn task_update_by_ordinal(
    markdown: String,
    ordinal: u32,
    scheduled_date: String,
    due_date: String,
) -> Option<String> {
    let newline = if markdown.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let mut lines: Vec<String> = markdown.lines().map(|line| line.to_string()).collect();
    let mut idx = 0u32;
    for line in &mut lines {
        let Some((prefix, body)) = task_line_parts(line) else {
            continue;
        };
        if idx != ordinal {
            idx += 1;
            continue;
        }
        let rebuilt = rewrite_task_dates(body, scheduled_date.trim(), due_date.trim());
        *line = format!("{prefix}{rebuilt}");
        let mut next = lines.join(newline);
        if markdown.ends_with(newline) {
            next.push_str(newline);
        }
        return Some(next);
    }
    None
}

#[tauri::command(rename_all = "snake_case")]
pub fn task_summary(markdown: String) -> NoteTaskSummary {
    summarize_tasks(&markdown)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn task_summaries_for_paths(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    note_paths: Vec<String>,
) -> Result<Vec<NoteTaskSummaryItem>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<NoteTaskSummaryItem>, String> {
        let paths = note_paths
            .into_iter()
            .map(|path| path.trim().replace('\\', "/"))
            .filter(|path| !path.is_empty())
            .collect::<Vec<_>>();
        let conn = open_db(&root)?;
        query_note_task_summaries(&conn, &paths)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn backlinks(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    note_id: String,
    _space_path: Option<String>,
) -> Result<Vec<BacklinkItem>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<BacklinkItem>, String> {
        let conn = open_db(&root)?;
        let stem = Path::new(&note_id)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT n.id, n.title, n.updated
                 FROM notes n
                 JOIN (
                    SELECT l.from_id
                    FROM links l
                    WHERE l.to_id = ? OR (l.to_title IS NOT NULL AND l.to_title = ?)
                    UNION
                    SELECT r.from_id
                    FROM note_relationships r
                    WHERE r.to_id = ? OR r.to_title = ? OR r.target_title = ?
                 ) refs ON refs.from_id = n.id
                 ORDER BY n.updated DESC
                 LIMIT 100",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(rusqlite::params![note_id, stem, note_id, stem, stem])
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            out.push(BacklinkItem {
                id: row.get(0).map_err(|e| e.to_string())?,
                title: row.get(1).map_err(|e| e.to_string())?,
                updated: row.get(2).map_err(|e| e.to_string())?,
            });
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn note_relationships(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    note_id: String,
) -> Result<Vec<NoteRelationship>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<NoteRelationship>, String> {
        let conn = open_db(&root)?;
        query_note_relationships(&conn, &note_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn local_note_graph_for_conn(
    conn: &rusqlite::Connection,
    note_id: &str,
) -> Result<LocalNoteGraph, String> {
    const COMMON_TAG_LIMIT: usize = 12;
    const TAGGED_NOTES_PER_TAG_LIMIT: usize = 12;
    const TOTAL_TAGGED_NOTES_LIMIT: usize = 64;

    let center = conn
        .query_row(
            "SELECT id, title FROM notes WHERE id = ? LIMIT 1",
            [note_id],
            |row| {
                Ok(LocalGraphNode {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    is_center: true,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let mut nodes_by_id = HashMap::new();
    nodes_by_id.insert(center.id.clone(), LocalGraphNode { ..center.clone() });

    let mut neighbor_stmt = conn
        .prepare(
            "SELECT DISTINCT n.id, n.title
             FROM notes n
             JOIN (
                SELECT l.to_id AS note_id
                FROM links l
                WHERE l.from_id = ? AND l.to_id IS NOT NULL
                UNION
                SELECT l.from_id AS note_id
                FROM links l
                WHERE l.to_id = ?
                UNION
                SELECT r.to_id AS note_id
                FROM note_relationships r
                WHERE r.from_id = ? AND r.to_id IS NOT NULL
                UNION
                SELECT r.from_id AS note_id
                FROM note_relationships r
                WHERE r.to_id = ?
             ) related ON related.note_id = n.id
             WHERE n.id <> ?",
        )
        .map_err(|e| e.to_string())?;
    let mut neighbor_rows = neighbor_stmt
        .query(rusqlite::params![
            note_id, note_id, note_id, note_id, note_id
        ])
        .map_err(|e| e.to_string())?;
    while let Some(row) = neighbor_rows.next().map_err(|e| e.to_string())? {
        let id: String = row.get(0).map_err(|e| e.to_string())?;
        let title: String = row.get(1).map_err(|e| e.to_string())?;
        nodes_by_id.insert(
            id.clone(),
            LocalGraphNode {
                id,
                title,
                is_center: false,
            },
        );
    }

    let seed_node_ids = nodes_by_id.keys().cloned().collect::<Vec<_>>();
    let (tags, tagged_nodes, tag_edges) = local_graph_tag_expansion_for_seed_nodes(
        conn,
        &seed_node_ids,
        COMMON_TAG_LIMIT,
        TAGGED_NOTES_PER_TAG_LIMIT,
        TOTAL_TAGGED_NOTES_LIMIT,
    )?;
    for node in tagged_nodes {
        nodes_by_id.entry(node.id.clone()).or_insert(node);
    }

    let node_ids = nodes_by_id.keys().cloned().collect::<Vec<_>>();
    let placeholders = std::iter::repeat_n("?", node_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let edge_query = format!(
        "SELECT DISTINCT from_id, to_id
         FROM (
            SELECT from_id, to_id
            FROM links
            WHERE to_id IS NOT NULL
            UNION
            SELECT from_id, to_id
            FROM note_relationships
            WHERE to_id IS NOT NULL
         )
         WHERE from_id IN ({placeholders})
           AND to_id IN ({placeholders})
           AND from_id <> to_id"
    );
    let mut edge_stmt = conn.prepare(&edge_query).map_err(|e| e.to_string())?;
    let params = rusqlite::params_from_iter(node_ids.iter().chain(node_ids.iter()));
    let mut edge_rows = edge_stmt.query(params).map_err(|e| e.to_string())?;
    let mut edges = Vec::new();
    while let Some(row) = edge_rows.next().map_err(|e| e.to_string())? {
        edges.push(LocalGraphEdge {
            source: row.get(0).map_err(|e| e.to_string())?,
            target: row.get(1).map_err(|e| e.to_string())?,
        });
    }

    let mut nodes = nodes_by_id.into_values().collect::<Vec<_>>();
    nodes.sort_by(|left, right| {
        right
            .is_center
            .cmp(&left.is_center)
            .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
            .then_with(|| left.id.cmp(&right.id))
    });

    Ok(LocalNoteGraph {
        center,
        nodes,
        edges,
        tags,
        tag_edges,
    })
}

fn local_graph_tag_id(tag: &str) -> String {
    format!("glyph:tag:{tag}")
}

fn local_graph_tag_expansion_for_seed_nodes(
    conn: &rusqlite::Connection,
    seed_node_ids: &[String],
    tag_limit: usize,
    notes_per_tag_limit: usize,
    total_tagged_notes_limit: usize,
) -> Result<
    (
        Vec<LocalGraphTagNode>,
        Vec<LocalGraphNode>,
        Vec<LocalGraphTagEdge>,
    ),
    String,
> {
    if seed_node_ids.len() < 2 {
        return Ok((Vec::new(), Vec::new(), Vec::new()));
    }

    let seed_placeholders = std::iter::repeat_n("?", seed_node_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let tag_query = format!(
        "SELECT tag
         FROM tags
         WHERE is_explicit = 1
           AND tag NOT LIKE ?
           AND note_id IN ({seed_placeholders})
         GROUP BY tag
         HAVING COUNT(*) > 1
         ORDER BY COUNT(*) DESC, tag COLLATE NOCASE ASC
         LIMIT ?"
    );
    let mut params = Vec::<rusqlite::types::Value>::new();
    params.push(format!("{PEOPLE_TAG_NAMESPACE}%").into());
    params.extend(seed_node_ids.iter().cloned().map(Into::into));
    params.push((tag_limit as i64).into());

    let mut tag_stmt = conn.prepare(&tag_query).map_err(|e| e.to_string())?;
    let mut tag_rows = tag_stmt
        .query(rusqlite::params_from_iter(params))
        .map_err(|e| e.to_string())?;
    let mut tag_names = Vec::new();
    while let Some(row) = tag_rows.next().map_err(|e| e.to_string())? {
        tag_names.push(row.get::<_, String>(0).map_err(|e| e.to_string())?);
    }

    if tag_names.is_empty() {
        return Ok((Vec::new(), Vec::new(), Vec::new()));
    }

    let edge_query = format!(
        "SELECT n.id, n.title
         FROM tags t
         JOIN notes n ON n.id = t.note_id
         WHERE t.is_explicit = 1
           AND t.tag = ?
         ORDER BY CASE WHEN n.id IN ({seed_placeholders}) THEN 0 ELSE 1 END,
                  n.title COLLATE NOCASE ASC,
                  n.id ASC
         LIMIT ?"
    );
    let mut tag_edges = Vec::new();
    let mut tagged_nodes_by_id = HashMap::<String, LocalGraphNode>::new();
    let mut note_count_by_tag = HashMap::<String, u32>::new();
    let mut edge_stmt = conn.prepare(&edge_query).map_err(|e| e.to_string())?;
    for tag in &tag_names {
        if tagged_nodes_by_id.len() >= total_tagged_notes_limit {
            break;
        }

        let mut edge_params = Vec::<rusqlite::types::Value>::new();
        edge_params.push(tag.clone().into());
        edge_params.extend(seed_node_ids.iter().cloned().map(Into::into));
        edge_params.push((notes_per_tag_limit as i64).into());
        let mut edge_rows = edge_stmt
            .query(rusqlite::params_from_iter(edge_params))
            .map_err(|e| e.to_string())?;
        while let Some(row) = edge_rows.next().map_err(|e| e.to_string())? {
            if tagged_nodes_by_id.len() >= total_tagged_notes_limit {
                break;
            }

            let tag_note_count = note_count_by_tag.get(tag).copied().unwrap_or(0) as usize;
            if tag_note_count >= notes_per_tag_limit {
                break;
            }

            let note_id: String = row.get(0).map_err(|e| e.to_string())?;
            let title: String = row.get(1).map_err(|e| e.to_string())?;
            tagged_nodes_by_id
                .entry(note_id.clone())
                .or_insert(LocalGraphNode {
                    id: note_id.clone(),
                    title,
                    is_center: false,
                });
            *note_count_by_tag.entry(tag.clone()).or_insert(0) += 1;
            tag_edges.push(LocalGraphTagEdge {
                tag_id: local_graph_tag_id(tag),
                note_id,
            });
        }
    }

    let tags = tag_names
        .into_iter()
        .filter_map(|tag| {
            let note_count = note_count_by_tag.get(&tag).copied()?;
            Some(LocalGraphTagNode {
                id: local_graph_tag_id(&tag),
                title: format!("#{tag}"),
                tag,
                note_count,
            })
        })
        .collect::<Vec<_>>();

    Ok((
        tags,
        tagged_nodes_by_id.into_values().collect::<Vec<_>>(),
        tag_edges,
    ))
}

struct SpaceGraphNodeSeed {
    id: String,
    title: String,
    link_count: u32,
    tag_count: u32,
}

fn space_graph_for_conn(
    conn: &rusqlite::Connection,
    max_nodes: usize,
    max_tags: usize,
) -> Result<SpaceGraph, String> {
    let total_notes = conn
        .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get::<_, i64>(0))
        .map(|count| count as u32)
        .map_err(|e| e.to_string())?;
    let truncated = total_notes as usize > max_nodes;
    let people_tag_like = format!("{PEOPLE_TAG_NAMESPACE}%");
    let node_limit = max_nodes.max(1);
    let node_order = if truncated {
        "(COALESCE(edge_counts.link_count, 0) + COALESCE(tag_counts.tag_count, 0)) DESC,
         n.title COLLATE NOCASE ASC,
         n.id ASC"
    } else {
        "n.title COLLATE NOCASE ASC, n.id ASC"
    };
    let node_query = format!(
        "WITH edge_counts AS (
            SELECT note_id, COUNT(*) AS link_count
            FROM (
                SELECT l.from_id AS note_id
                FROM links l
                JOIN notes target ON target.id = l.to_id
                WHERE l.to_id IS NOT NULL AND l.from_id <> l.to_id
                UNION ALL
                SELECT l.to_id AS note_id
                FROM links l
                JOIN notes source ON source.id = l.from_id
                WHERE l.to_id IS NOT NULL AND l.from_id <> l.to_id
                UNION ALL
                SELECT r.from_id AS note_id
                FROM note_relationships r
                JOIN notes target ON target.id = r.to_id
                WHERE r.to_id IS NOT NULL AND r.from_id <> r.to_id
                UNION ALL
                SELECT r.to_id AS note_id
                FROM note_relationships r
                JOIN notes source ON source.id = r.from_id
                WHERE r.to_id IS NOT NULL AND r.from_id <> r.to_id
            )
            GROUP BY note_id
         ),
         tag_counts AS (
            SELECT note_id, COUNT(DISTINCT tag) AS tag_count
            FROM tags
            WHERE is_explicit = 1
              AND tag NOT LIKE ?
            GROUP BY note_id
         )
         SELECT n.id,
                n.title,
                COALESCE(edge_counts.link_count, 0) AS link_count,
                COALESCE(tag_counts.tag_count, 0) AS tag_count
         FROM notes n
         LEFT JOIN edge_counts ON edge_counts.note_id = n.id
         LEFT JOIN tag_counts ON tag_counts.note_id = n.id
         ORDER BY {node_order}
         LIMIT ?"
    );
    let mut node_stmt = conn.prepare(&node_query).map_err(|e| e.to_string())?;
    let mut node_rows = node_stmt
        .query(rusqlite::params![people_tag_like, node_limit as i64])
        .map_err(|e| e.to_string())?;
    let mut node_seeds = Vec::new();
    while let Some(row) = node_rows.next().map_err(|e| e.to_string())? {
        node_seeds.push(SpaceGraphNodeSeed {
            id: row.get(0).map_err(|e| e.to_string())?,
            title: row.get(1).map_err(|e| e.to_string())?,
            link_count: row.get::<_, i64>(2).map_err(|e| e.to_string())? as u32,
            tag_count: row.get::<_, i64>(3).map_err(|e| e.to_string())? as u32,
        });
    }

    if node_seeds.is_empty() {
        return Ok(SpaceGraph {
            nodes: Vec::new(),
            edges: Vec::new(),
            tags: Vec::new(),
            tag_edges: Vec::new(),
            truncated,
            truncated_tags: false,
            total_notes,
            total_tags: 0,
        });
    }

    let selected_ids = node_seeds
        .iter()
        .map(|node| node.id.clone())
        .collect::<Vec<_>>();
    let selected_placeholders = std::iter::repeat_n("?", selected_ids.len())
        .collect::<Vec<_>>()
        .join(", ");

    let edge_query = format!(
        "SELECT DISTINCT from_id, to_id, kind
         FROM (
            SELECT from_id, to_id, 'link' AS kind
            FROM links
            WHERE to_id IS NOT NULL
            UNION
            SELECT from_id, to_id, 'relationship' AS kind
            FROM note_relationships
            WHERE to_id IS NOT NULL
         )
         WHERE from_id <> to_id
           AND from_id IN ({selected_placeholders})
           AND to_id IN ({selected_placeholders})
         ORDER BY from_id COLLATE NOCASE ASC, to_id COLLATE NOCASE ASC, kind ASC"
    );
    let mut edge_stmt = conn.prepare(&edge_query).map_err(|e| e.to_string())?;
    let edge_params = rusqlite::params_from_iter(selected_ids.iter().chain(selected_ids.iter()));
    let mut edge_rows = edge_stmt.query(edge_params).map_err(|e| e.to_string())?;
    let mut edges = Vec::new();
    while let Some(row) = edge_rows.next().map_err(|e| e.to_string())? {
        edges.push(SpaceGraphEdge {
            from_id: row.get(0).map_err(|e| e.to_string())?,
            to_id: row.get(1).map_err(|e| e.to_string())?,
            kind: row.get(2).map_err(|e| e.to_string())?,
        });
    }

    let total_tag_query = format!(
        "SELECT COUNT(*)
         FROM (
            SELECT DISTINCT tag
            FROM tags
            WHERE is_explicit = 1
              AND tag NOT LIKE ?
              AND note_id IN ({selected_placeholders})
         )"
    );
    let mut total_tag_params = Vec::<rusqlite::types::Value>::new();
    total_tag_params.push(format!("{PEOPLE_TAG_NAMESPACE}%").into());
    total_tag_params.extend(selected_ids.iter().cloned().map(Into::into));
    let total_tags = conn
        .query_row(
            &total_tag_query,
            rusqlite::params_from_iter(total_tag_params),
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count as u32)
        .map_err(|e| e.to_string())?;
    let truncated_tags = total_tags as usize > max_tags;

    let mut tags = Vec::new();
    let mut tag_edges = Vec::new();
    if max_tags > 0 && total_tags > 0 {
        let tag_query = format!(
            "SELECT tag, COUNT(DISTINCT note_id) AS note_count
             FROM tags
             WHERE is_explicit = 1
               AND tag NOT LIKE ?
               AND note_id IN ({selected_placeholders})
             GROUP BY tag
             ORDER BY note_count DESC, tag COLLATE NOCASE ASC
             LIMIT ?"
        );
        let mut tag_params = Vec::<rusqlite::types::Value>::new();
        tag_params.push(format!("{PEOPLE_TAG_NAMESPACE}%").into());
        tag_params.extend(selected_ids.iter().cloned().map(Into::into));
        tag_params.push((max_tags as i64).into());
        let mut tag_stmt = conn.prepare(&tag_query).map_err(|e| e.to_string())?;
        let mut tag_rows = tag_stmt
            .query(rusqlite::params_from_iter(tag_params))
            .map_err(|e| e.to_string())?;
        let mut selected_tags = Vec::new();
        while let Some(row) = tag_rows.next().map_err(|e| e.to_string())? {
            let tag: String = row.get(0).map_err(|e| e.to_string())?;
            selected_tags.push(tag.clone());
            tags.push(SpaceGraphTagNode {
                id: local_graph_tag_id(&tag),
                title: format!("#{tag}"),
                tag,
                note_count: row.get::<_, i64>(1).map_err(|e| e.to_string())? as u32,
            });
        }

        if !selected_tags.is_empty() {
            let tag_placeholders = std::iter::repeat_n("?", selected_tags.len())
                .collect::<Vec<_>>()
                .join(", ");
            let tag_edge_query = format!(
                "SELECT DISTINCT tag, note_id
                 FROM tags
                 WHERE is_explicit = 1
                   AND tag IN ({tag_placeholders})
                   AND note_id IN ({selected_placeholders})
                 ORDER BY tag COLLATE NOCASE ASC, note_id COLLATE NOCASE ASC"
            );
            let mut tag_edge_params = Vec::<rusqlite::types::Value>::new();
            tag_edge_params.extend(selected_tags.iter().cloned().map(Into::into));
            tag_edge_params.extend(selected_ids.iter().cloned().map(Into::into));
            let mut tag_edge_stmt = conn.prepare(&tag_edge_query).map_err(|e| e.to_string())?;
            let mut tag_edge_rows = tag_edge_stmt
                .query(rusqlite::params_from_iter(tag_edge_params))
                .map_err(|e| e.to_string())?;
            while let Some(row) = tag_edge_rows.next().map_err(|e| e.to_string())? {
                let tag: String = row.get(0).map_err(|e| e.to_string())?;
                tag_edges.push(SpaceGraphTagEdge {
                    tag_id: local_graph_tag_id(&tag),
                    note_id: row.get(1).map_err(|e| e.to_string())?,
                });
            }
        }
    }

    let mut returned_tag_edge_count_by_note = HashMap::<String, u32>::new();
    for edge in &tag_edges {
        *returned_tag_edge_count_by_note
            .entry(edge.note_id.clone())
            .or_insert(0) += 1;
    }
    let nodes = node_seeds
        .into_iter()
        .map(|node| {
            let returned_tag_edge_count = returned_tag_edge_count_by_note
                .get(&node.id)
                .copied()
                .unwrap_or(0);
            SpaceGraphNode {
                id: node.id,
                title: node.title,
                link_count: node.link_count,
                tag_count: node.tag_count,
                is_isolated: node.link_count == 0 && returned_tag_edge_count == 0,
            }
        })
        .collect::<Vec<_>>();

    Ok(SpaceGraph {
        nodes,
        edges,
        tags,
        tag_edges,
        truncated,
        truncated_tags,
        total_notes,
        total_tags,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn note_local_graph(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    note_id: String,
) -> Result<LocalNoteGraph, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<LocalNoteGraph, String> {
        let conn = open_db(&root)?;
        local_note_graph_for_conn(&conn, &note_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_graph(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    max_nodes: Option<u32>,
    max_tags: Option<u32>,
) -> Result<SpaceGraph, String> {
    let root = state.root_for_window(&window)?;
    let max_nodes = max_nodes.unwrap_or(1000).clamp(1, 10_000) as usize;
    let max_tags = max_tags.unwrap_or(250).clamp(0, 1000) as usize;
    tauri::async_runtime::spawn_blocking(move || -> Result<SpaceGraph, String> {
        let conn = open_db(&root)?;
        space_graph_for_conn(&conn, max_nodes, max_tags)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod local_graph_tests {
    use rusqlite::Connection;

    use crate::index::schema::ensure_schema;

    use super::{local_graph_tag_expansion_for_seed_nodes, local_note_graph_for_conn};

    #[test]
    fn local_note_graph_returns_center_neighbors_and_internal_edges() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        for (id, title) in [
            ("notes/center.md", "Center"),
            ("notes/outgoing.md", "Outgoing"),
            ("notes/incoming.md", "Incoming"),
            ("notes/mutual.md", "Mutual"),
            ("notes/neighbor-link.md", "Neighbor Link"),
        ] {
            conn.execute(
                "INSERT INTO notes(id, title, created, updated, path, etag, preview)
                 VALUES(?, ?, '2026-01-01', '2026-01-01', ?, ?, '')",
                rusqlite::params![id, title, id, format!("{id}-etag")],
            )
            .unwrap();
        }

        for (from_id, to_id) in [
            ("notes/center.md", "notes/outgoing.md"),
            ("notes/incoming.md", "notes/center.md"),
            ("notes/center.md", "notes/mutual.md"),
            ("notes/mutual.md", "notes/center.md"),
            ("notes/outgoing.md", "notes/neighbor-link.md"),
        ] {
            conn.execute(
                "INSERT INTO links(from_id, to_id, to_title, kind) VALUES(?, ?, NULL, 'note')",
                rusqlite::params![from_id, to_id],
            )
            .unwrap();
        }

        conn.execute(
            "INSERT INTO links(from_id, to_id, to_title, kind) VALUES(?, NULL, ?, 'wikilink')",
            rusqlite::params!["notes/center.md", "Missing Note"],
        )
        .unwrap();

        let graph = local_note_graph_for_conn(&conn, "notes/center.md").unwrap();
        assert_eq!(graph.center.id, "notes/center.md");
        assert_eq!(graph.nodes.len(), 4);

        let node_ids = graph
            .nodes
            .iter()
            .map(|node| node.id.as_str())
            .collect::<Vec<_>>();
        assert!(node_ids.contains(&"notes/center.md"));
        assert!(node_ids.contains(&"notes/outgoing.md"));
        assert!(node_ids.contains(&"notes/incoming.md"));
        assert!(node_ids.contains(&"notes/mutual.md"));
        assert!(!node_ids.contains(&"notes/neighbor-link.md"));

        let edges = graph
            .edges
            .iter()
            .map(|edge| (edge.source.as_str(), edge.target.as_str()))
            .collect::<Vec<_>>();
        assert!(edges.contains(&("notes/center.md", "notes/outgoing.md")));
        assert!(edges.contains(&("notes/incoming.md", "notes/center.md")));
        assert!(edges.contains(&("notes/center.md", "notes/mutual.md")));
        assert!(edges.contains(&("notes/mutual.md", "notes/center.md")));
        assert!(!edges.contains(&("notes/outgoing.md", "notes/neighbor-link.md")));
    }

    #[test]
    fn local_note_graph_handles_single_isolated_note() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        conn.execute(
            "INSERT INTO notes(id, title, created, updated, path, etag, preview)
             VALUES('notes/solo.md', 'Solo', '2026-01-01', '2026-01-01', 'notes/solo.md', 'solo-etag', '')",
            [],
        )
        .unwrap();

        let graph = local_note_graph_for_conn(&conn, "notes/solo.md").unwrap();
        assert_eq!(graph.center.id, "notes/solo.md");
        assert_eq!(graph.nodes.len(), 1);
        assert!(graph.nodes[0].is_center);
        assert!(graph.edges.is_empty());
    }

    #[test]
    fn local_note_graph_caps_tag_expansion_per_tag() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        for (id, title) in [
            ("notes/center.md".to_string(), "Center".to_string()),
            ("notes/neighbor.md".to_string(), "Neighbor".to_string()),
        ]
        .into_iter()
        .chain((0..20).map(|index| {
            (
                format!("notes/common-{index:02}.md"),
                format!("Common {index:02}"),
            )
        })) {
            conn.execute(
                "INSERT INTO notes(id, title, created, updated, path, etag, preview)
                 VALUES(?, ?, '2026-01-01', '2026-01-01', ?, ?, '')",
                rusqlite::params![&id, &title, &id, format!("{id}-etag")],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, 'project', 1)",
                [&id],
            )
            .unwrap();
        }

        conn.execute(
            "INSERT INTO links(from_id, to_id, to_title, kind) VALUES(?, ?, NULL, 'note')",
            rusqlite::params!["notes/center.md", "notes/neighbor.md"],
        )
        .unwrap();

        let graph = local_note_graph_for_conn(&conn, "notes/center.md").unwrap();
        assert_eq!(graph.nodes.len(), 12);
        assert_eq!(graph.tag_edges.len(), 12);
        assert!(graph.nodes.iter().any(|node| node.id == "notes/center.md"));
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.id == "notes/neighbor.md"));
        assert!(!graph
            .nodes
            .iter()
            .any(|node| node.id == "notes/common-10.md"));
        assert_eq!(graph.tags.len(), 1);
        assert_eq!(graph.tags[0].tag, "project");
        assert_eq!(graph.tags[0].note_count, 12);
    }

    #[test]
    fn local_graph_tag_expansion_caps_total_expanded_nodes() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        for (id, title) in [
            ("notes/center.md".to_string(), "Center".to_string()),
            ("notes/neighbor.md".to_string(), "Neighbor".to_string()),
        ]
        .into_iter()
        .chain((0..20).map(|index| {
            (
                format!("notes/tagged-{index:02}.md"),
                format!("Tagged {index:02}"),
            )
        })) {
            conn.execute(
                "INSERT INTO notes(id, title, created, updated, path, etag, preview)
                 VALUES(?, ?, '2026-01-01', '2026-01-01', ?, ?, '')",
                rusqlite::params![&id, &title, &id, format!("{id}-etag")],
            )
            .unwrap();
            for tag in ["project", "todo"] {
                conn.execute(
                    "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, ?, 1)",
                    rusqlite::params![&id, tag],
                )
                .unwrap();
            }
        }

        let seed_node_ids = vec![
            "notes/center.md".to_string(),
            "notes/neighbor.md".to_string(),
        ];
        let (tags, tagged_nodes, tag_edges) =
            local_graph_tag_expansion_for_seed_nodes(&conn, &seed_node_ids, 12, 12, 5).unwrap();

        assert_eq!(tagged_nodes.len(), 5);
        assert_eq!(tag_edges.len(), 5);
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].note_count, 5);
    }
}

#[cfg(test)]
mod space_graph_tests {
    use std::time::Instant;

    use rusqlite::Connection;

    use crate::index::schema::ensure_schema;
    use crate::index::tags::PEOPLE_TAG_NAMESPACE;

    use super::space_graph_for_conn;

    fn insert_note(conn: &Connection, id: &str, title: &str) {
        conn.execute(
            "INSERT INTO notes(id, title, created, updated, path, etag, preview)
             VALUES(?, ?, '2026-01-01', '2026-01-01', ?, ?, '')",
            rusqlite::params![id, title, id, format!("{id}-etag")],
        )
        .unwrap();
    }

    #[test]
    fn space_graph_under_cap_includes_linked_tagged_and_isolated_notes() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        for (id, title) in [
            ("notes/alpha.md", "Alpha"),
            ("notes/beta.md", "Beta"),
            ("notes/tagged.md", "Tagged"),
            ("notes/isolated.md", "Isolated"),
        ] {
            insert_note(&conn, id, title);
        }
        conn.execute(
            "INSERT INTO links(from_id, to_id, to_title, kind) VALUES(?, ?, NULL, 'note')",
            rusqlite::params!["notes/alpha.md", "notes/beta.md"],
        )
        .unwrap();
        for note_id in ["notes/alpha.md", "notes/tagged.md"] {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, 'project', 1)",
                [note_id],
            )
            .unwrap();
        }

        let graph = space_graph_for_conn(&conn, 10, 10).unwrap();
        assert!(!graph.truncated);
        assert_eq!(graph.total_notes, 4);
        assert_eq!(graph.nodes.len(), 4);
        assert_eq!(graph.edges.len(), 1);
        assert_eq!(graph.edges[0].kind, "link");
        assert_eq!(graph.tags.len(), 1);
        assert_eq!(graph.tag_edges.len(), 2);

        let isolated = graph
            .nodes
            .iter()
            .find(|node| node.id == "notes/isolated.md")
            .unwrap();
        assert!(isolated.is_isolated);

        let tagged = graph
            .nodes
            .iter()
            .find(|node| node.id == "notes/tagged.md")
            .unwrap();
        assert!(!tagged.is_isolated);
    }

    #[test]
    fn space_graph_truncates_to_highest_degree_nodes() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        for (id, title) in [
            ("notes/high.md", "High"),
            ("notes/medium.md", "Medium"),
            ("notes/low.md", "Low"),
            ("notes/zero.md", "Zero"),
        ] {
            insert_note(&conn, id, title);
        }
        for (from_id, to_id) in [
            ("notes/high.md", "notes/medium.md"),
            ("notes/high.md", "notes/low.md"),
            ("notes/medium.md", "notes/high.md"),
        ] {
            conn.execute(
                "INSERT INTO links(from_id, to_id, to_title, kind) VALUES(?, ?, NULL, 'note')",
                rusqlite::params![from_id, to_id],
            )
            .unwrap();
        }
        for tag in ["one", "two"] {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES('notes/high.md', ?, 1)",
                [tag],
            )
            .unwrap();
        }

        let graph = space_graph_for_conn(&conn, 2, 10).unwrap();
        let node_ids = graph
            .nodes
            .iter()
            .map(|node| node.id.as_str())
            .collect::<Vec<_>>();
        assert!(graph.truncated);
        assert_eq!(graph.total_notes, 4);
        assert_eq!(node_ids, vec!["notes/high.md", "notes/medium.md"]);
        assert!(!node_ids.contains(&"notes/zero.md"));
    }

    #[test]
    fn space_graph_excludes_edges_with_missing_endpoints() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        insert_note(&conn, "notes/source.md", "Source");

        conn.execute(
            "INSERT INTO links(from_id, to_id, to_title, kind) VALUES(?, ?, NULL, 'note')",
            rusqlite::params!["notes/source.md", "notes/missing.md"],
        )
        .unwrap();

        let graph = space_graph_for_conn(&conn, 10, 10).unwrap();
        assert!(graph.edges.is_empty());
        assert_eq!(graph.nodes[0].link_count, 0);
        assert!(graph.nodes[0].is_isolated);
    }

    #[test]
    fn space_graph_returns_explicit_tags_and_excludes_people_and_virtual_tags() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        insert_note(&conn, "notes/tagged.md", "Tagged");

        for (tag, is_explicit) in [
            ("work".to_string(), 1),
            (format!("{PEOPLE_TAG_NAMESPACE}ada"), 1),
            ("virtual-parent".to_string(), 0),
        ] {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES('notes/tagged.md', ?, ?)",
                rusqlite::params![tag, is_explicit],
            )
            .unwrap();
        }

        let graph = space_graph_for_conn(&conn, 10, 10).unwrap();
        assert_eq!(graph.total_tags, 1);
        assert_eq!(graph.tags.len(), 1);
        assert_eq!(graph.tags[0].tag, "work");
        assert_eq!(graph.tag_edges.len(), 1);
    }

    #[test]
    fn space_graph_tag_cap_sets_truncated_tags() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        insert_note(&conn, "notes/tagged.md", "Tagged");

        for tag in ["alpha", "beta"] {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES('notes/tagged.md', ?, 1)",
                [tag],
            )
            .unwrap();
        }

        let graph = space_graph_for_conn(&conn, 10, 1).unwrap();
        assert_eq!(graph.total_tags, 2);
        assert!(graph.truncated_tags);
        assert_eq!(graph.tags.len(), 1);
        assert_eq!(graph.tags[0].tag, "alpha");
        assert_eq!(graph.tag_edges.len(), 1);
    }

    #[test]
    fn space_graph_includes_relationship_edges() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        insert_note(&conn, "notes/source.md", "Source");
        insert_note(&conn, "notes/target.md", "Target");

        conn.execute(
            "INSERT INTO note_relationships(from_id, field_key, to_id, to_title, target_title, ordinal)
             VALUES(?, 'related', ?, NULL, 'Target', 0)",
            rusqlite::params!["notes/source.md", "notes/target.md"],
        )
        .unwrap();

        let graph = space_graph_for_conn(&conn, 10, 10).unwrap();
        assert_eq!(graph.edges.len(), 1);
        assert_eq!(graph.edges[0].kind, "relationship");
        assert_eq!(graph.edges[0].from_id, "notes/source.md");
        assert_eq!(graph.edges[0].to_id, "notes/target.md");
    }

    #[test]
    fn space_graph_synthetic_scale_stays_under_spike_budget() {
        let mut conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        let tx = conn.transaction().unwrap();
        for index in 0..2_000 {
            let id = format!("notes/n{index:04}.md");
            let title = format!("Note {index:04}");
            tx.execute(
                "INSERT INTO notes(id, title, created, updated, path, etag, preview)
                 VALUES(?, ?, '2026-01-01', '2026-01-01', ?, ?, '')",
                rusqlite::params![&id, &title, &id, format!("{id}-etag")],
            )
            .unwrap();
        }
        for index in 0..10_000 {
            let from_id = format!("notes/n{:04}.md", index % 2_000);
            let to_id = format!("notes/n{:04}.md", (index * 7 + 11) % 2_000);
            if from_id == to_id {
                continue;
            }
            tx.execute(
                "INSERT OR IGNORE INTO links(from_id, to_id, to_title, kind)
                 VALUES(?, ?, NULL, 'note')",
                rusqlite::params![from_id, to_id],
            )
            .unwrap();
        }
        for index in 0..500 {
            let note_id = format!("notes/n{:04}.md", index % 2_000);
            let tag = format!("topic-{:03}", index % 125);
            tx.execute(
                "INSERT OR IGNORE INTO tags(note_id, tag, is_explicit) VALUES(?, ?, 1)",
                rusqlite::params![note_id, tag],
            )
            .unwrap();
        }
        tx.commit().unwrap();

        let started = Instant::now();
        let graph = space_graph_for_conn(&conn, 1_000, 250).unwrap();
        let elapsed = started.elapsed();
        println!("space_graph synthetic scale duration: {elapsed:?}");

        assert!(graph.truncated);
        assert_eq!(graph.nodes.len(), 1_000);
        assert!(elapsed.as_millis() < 500);
    }
}
