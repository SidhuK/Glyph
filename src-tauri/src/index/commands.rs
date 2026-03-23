use std::collections::{HashMap, HashSet};
use std::path::Path;

use chrono::{Duration, NaiveDate};
use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_notification::NotificationExt;

use crate::space::state::mark_recent_local_change;
use crate::space::SpaceState;

use super::db::open_db;
use super::indexer::index_note;
use super::indexer::rebuild;
use super::search_advanced::{run_search_advanced, SearchAdvancedRequest};
use super::search_hybrid::hybrid_search;
use super::tags::normalize_tag;
use super::tasks::{
    mutate_task_line, note_abs_path, query_tasks, write_note, IndexedTask, TaskBucket,
};
use super::types::{BacklinkItem, IndexRebuildResult, SearchResult, TagCount, TaskDateInfo};

#[derive(Serialize)]
pub struct CalendarDaySummary {
    pub date: String,
    pub task_count: u32,
    pub note_activity_count: u32,
    pub has_daily_note: bool,
    pub needs_daily_note_setup: bool,
}

#[derive(Serialize)]
pub struct CalendarNoteActivityItem {
    pub note_id: String,
    pub note_path: String,
    pub title: String,
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

pub(crate) fn parse_raw_search_query(raw_query: &str, limit: Option<u32>) -> SearchAdvancedRequest {
    let mut req = SearchAdvancedRequest {
        limit: Some(limit.unwrap_or(1500).clamp(1, 2_000)),
        ..SearchAdvancedRequest::default()
    };
    let mut tags: Vec<String> = Vec::new();
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
        text_parts.push(token);
    }

    req.tags = tags;
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
                &right
                    .scheduled_date
                    .as_deref()
                    .unwrap_or(right.due_date.as_deref().unwrap_or("9999-12-31")),
            )
            .then_with(|| left.due_date.cmp(&right.due_date))
            .then_with(|| left.note_title.cmp(&right.note_title))
            .then_with(|| left.line_start.cmp(&right.line_start))
    });
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
    app: AppHandle,
    state: State<'_, SpaceState>,
) -> Result<IndexRebuildResult, String> {
    let root = state.current_root()?;
    let res = tauri::async_runtime::spawn_blocking(move || rebuild(&root))
        .await
        .map_err(|e| e.to_string())??;
    let _ = app
        .notification()
        .builder()
        .title("Glyph")
        .body(format!("Index rebuilt ({})", res.indexed))
        .show();
    Ok(res)
}

#[tauri::command]
pub async fn search(
    state: State<'_, SpaceState>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<SearchResult>, String> {
        let conn = open_db(&root)?;
        hybrid_search(&conn, &query, &[], 50)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn search_advanced(
    state: State<'_, SpaceState>,
    request: SearchAdvancedRequest,
) -> Result<Vec<SearchResult>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<SearchResult>, String> {
        let conn = open_db(&root)?;
        run_search_advanced(&conn, request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn search_parse_and_run(
    state: State<'_, SpaceState>,
    raw_query: String,
    limit: Option<u32>,
) -> Result<Vec<SearchResult>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<SearchResult>, String> {
        let req = parse_raw_search_query(&raw_query, limit);
        let conn = open_db(&root)?;
        run_search_advanced(&conn, req)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn search_with_tags(
    state: State<'_, SpaceState>,
    tags: Vec<String>,
    query: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<SearchResult>, String> {
    let root = state.current_root()?;
    let lim = limit.unwrap_or(2000).min(20_000) as i64;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<SearchResult>, String> {
        let mut norm_tags = Vec::new();
        for raw in tags {
            let t = normalize_tag(&raw).ok_or_else(|| "invalid tag".to_string())?;
            if !norm_tags.contains(&t) {
                norm_tags.push(t);
            }
        }
        if norm_tags.is_empty() {
            return Ok(Vec::new());
        }

        let q = query.unwrap_or_default().trim().to_string();

        let conn = open_db(&root)?;
        let mut out = Vec::new();

        if q.is_empty() {
            let mut sql = String::from(
                "SELECT n.id, n.title, n.preview AS snippet, 0.0 AS score
                 FROM notes n ",
            );
            for i in 0..norm_tags.len() {
                sql.push_str(&format!(
                    "JOIN tags t{idx} ON t{idx}.note_id = n.id AND t{idx}.tag = ? ",
                    idx = i
                ));
            }
            sql.push_str("ORDER BY n.updated DESC LIMIT ?");

            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let mut params: Vec<rusqlite::types::Value> = norm_tags
                .iter()
                .map(|t| rusqlite::types::Value::from(t.clone()))
                .collect();
            params.push(rusqlite::types::Value::from(lim));

            let mut rows = stmt
                .query(rusqlite::params_from_iter(params.iter()))
                .map_err(|e| e.to_string())?;
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                out.push(SearchResult {
                    id: row.get(0).map_err(|e| e.to_string())?,
                    title: row.get(1).map_err(|e| e.to_string())?,
                    snippet: row.get(2).map_err(|e| e.to_string())?,
                    score: row.get(3).map_err(|e| e.to_string())?,
                });
            }
            return Ok(out);
        }
        hybrid_search(&conn, &q, &norm_tags, lim)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn recent_notes(
    state: State<'_, SpaceState>,
    limit: Option<u32>,
) -> Result<Vec<SearchResult>, String> {
    let root = state.current_root()?;
    let limit = limit.unwrap_or(8).min(50) as i64;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<SearchResult>, String> {
        let conn = open_db(&root)?;
        let mut stmt = conn
            .prepare(
                "SELECT id, title, preview AS snippet, 0.0 AS score
                 FROM notes
                 ORDER BY updated DESC
                 LIMIT ?",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([limit]).map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            out.push(SearchResult {
                id: row.get(0).map_err(|e| e.to_string())?,
                title: row.get(1).map_err(|e| e.to_string())?,
                snippet: row.get(2).map_err(|e| e.to_string())?,
                score: row.get(3).map_err(|e| e.to_string())?,
            });
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn calendar_query_range(
    state: State<'_, SpaceState>,
    start_date: String,
    end_date: String,
    selected_date: String,
    daily_notes_folder: Option<String>,
) -> Result<CalendarRangeResponse, String> {
    let root = state.current_root()?;
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
                 WHERE t.checked = 0 AND (t.scheduled_date IS NOT NULL OR t.due_date IS NOT NULL)",
            )
            .map_err(|e| e.to_string())?;
        let mut task_rows = task_stmt.query([]).map_err(|e| e.to_string())?;
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
            let scheduled = task.scheduled_date.as_deref();
            let due = task.due_date.as_deref();
            if let Some(date) = scheduled.filter(|date| *date >= start_date.as_str() && *date <= end_date.as_str()) {
                *task_counts.entry(date.to_string()).or_insert(0) += 1;
            }
            if let Some(date) = due.filter(|date| *date >= start_date.as_str() && *date <= end_date.as_str()) {
                if scheduled != Some(date) {
                    *task_counts.entry(date.to_string()).or_insert(0) += 1;
                }
            }
        }

        let mut note_stmt = conn
            .prepare(
                "SELECT id, title, path, created, updated
                 FROM notes
                 WHERE substr(created, 1, 10) BETWEEN ? AND ?
                    OR substr(updated, 1, 10) BETWEEN ? AND ?",
            )
            .map_err(|e| e.to_string())?;
        let mut note_rows = note_stmt
            .query([
                start_date.as_str(),
                end_date.as_str(),
                start_date.as_str(),
                end_date.as_str(),
            ])
            .map_err(|e| e.to_string())?;

        let mut note_activity = Vec::<CalendarNoteActivityItem>::new();
        while let Some(row) = note_rows.next().map_err(|e| e.to_string())? {
            let note_id: String = row.get(0).map_err(|e| e.to_string())?;
            let title: String = row.get(1).map_err(|e| e.to_string())?;
            let note_path: String = row.get(2).map_err(|e| e.to_string())?;
            let created: String = row.get(3).map_err(|e| e.to_string())?;
            let updated: String = row.get(4).map_err(|e| e.to_string())?;
            let created_day = created.get(0..10).unwrap_or_default().to_string();
            let updated_day = updated.get(0..10).unwrap_or_default().to_string();
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
    state: State<'_, SpaceState>,
    limit: Option<u32>,
) -> Result<Vec<TagCount>, String> {
    let root = state.current_root()?;
    let limit = limit.unwrap_or(200).min(2000) as i64;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<TagCount>, String> {
        let conn = open_db(&root)?;
        let mut stmt = conn
            .prepare(
                "SELECT tag, COUNT(*) AS c
                 FROM tags
                 GROUP BY tag
                 ORDER BY c DESC, tag ASC
                 LIMIT ?",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([limit]).map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            out.push(TagCount {
                tag: row.get(0).map_err(|e| e.to_string())?,
                count: row.get::<_, i64>(1).map_err(|e| e.to_string())? as u32,
            });
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn tag_notes(
    state: State<'_, SpaceState>,
    tag: String,
    limit: Option<u32>,
) -> Result<Vec<SearchResult>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<SearchResult>, String> {
        let t = normalize_tag(&tag).ok_or_else(|| "invalid tag".to_string())?;
        let conn = open_db(&root)?;
        if let Some(raw_limit) = limit {
            let limit = raw_limit.min(100_000) as i64;
            let mut stmt = conn
                .prepare(
                    "SELECT n.id, n.title, '' AS snippet, 0.0 AS score
                     FROM tags t
                     JOIN notes n ON n.id = t.note_id
                     WHERE t.tag = ?
                     ORDER BY n.updated DESC
                     LIMIT ?",
                )
                .map_err(|e| e.to_string())?;
            let mut rows = stmt
                .query(rusqlite::params![t, limit])
                .map_err(|e| e.to_string())?;
            let mut out = Vec::new();
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                out.push(SearchResult {
                    id: row.get(0).map_err(|e| e.to_string())?,
                    title: row.get(1).map_err(|e| e.to_string())?,
                    snippet: row.get(2).map_err(|e| e.to_string())?,
                    score: row.get(3).map_err(|e| e.to_string())?,
                });
            }
            Ok(out)
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT n.id, n.title, '' AS snippet, 0.0 AS score
                     FROM tags t
                     JOIN notes n ON n.id = t.note_id
                     WHERE t.tag = ?
                     ORDER BY n.updated DESC",
                )
                .map_err(|e| e.to_string())?;
            let mut rows = stmt
                .query(rusqlite::params![t])
                .map_err(|e| e.to_string())?;
            let mut out = Vec::new();
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                out.push(SearchResult {
                    id: row.get(0).map_err(|e| e.to_string())?,
                    title: row.get(1).map_err(|e| e.to_string())?,
                    snippet: row.get(2).map_err(|e| e.to_string())?,
                    score: row.get(3).map_err(|e| e.to_string())?,
                });
            }
            Ok(out)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn tasks_query(
    state: State<'_, SpaceState>,
    bucket: String,
    today: String,
    limit: Option<u32>,
    folders: Option<Vec<String>>,
) -> Result<Vec<IndexedTask>, String> {
    let root = state.current_root()?;
    let bucket = TaskBucket::parse(&bucket)?;
    let limit = limit.unwrap_or(500).min(5_000) as i64;
    let folders = folders.map(|folders| {
        folders
            .into_iter()
            .map(|folder| folder.trim().trim_matches('/').replace('\\', "/"))
            .filter(|folder| !folder.is_empty())
            .collect::<Vec<_>>()
    });
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<IndexedTask>, String> {
        if folders.as_ref().is_some_and(|folders| folders.is_empty()) {
            return Ok(Vec::new());
        }
        let conn = open_db(&root)?;
        query_tasks(&conn, bucket, &today, limit, folders.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn task_set_checked(
    state: State<'_, SpaceState>,
    task_id: String,
    checked: bool,
) -> Result<(), String> {
    let root = state.current_root()?;
    let recent_local_changes = state.recent_local_changes();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
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
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn task_set_dates(
    state: State<'_, SpaceState>,
    task_id: String,
    scheduled_date: Option<String>,
    due_date: Option<String>,
) -> Result<(), String> {
    let root = state.current_root()?;
    let recent_local_changes = state.recent_local_changes();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
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
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
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
pub async fn backlinks(
    state: State<'_, SpaceState>,
    note_id: String,
) -> Result<Vec<BacklinkItem>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<BacklinkItem>, String> {
        let conn = open_db(&root)?;
        let stem = Path::new(&note_id)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let mut stmt = conn
            .prepare(
                "SELECT n.id, n.title, n.updated
                 FROM links l
                 JOIN notes n ON n.id = l.from_id
                 WHERE l.to_id = ? OR (l.to_title IS NOT NULL AND l.to_title = ?)
                 ORDER BY n.updated DESC
                 LIMIT 100",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(rusqlite::params![note_id, stem])
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
