use std::path::Path;
use tauri::{AppHandle, State};
use tauri_plugin_notification::NotificationExt;

use crate::vault::VaultState;

use super::db::open_db;
use super::indexer::index_note;
use super::indexer::rebuild;
use super::search_advanced::{run_search_advanced, SearchAdvancedRequest};
use super::search_hybrid::hybrid_search;
use super::tags::normalize_tag;
use super::tasks::{
    mutate_task_line, note_abs_path, query_tasks, write_note, IndexedTask, TaskBucket,
};
use super::types::{
    BacklinkItem, IndexRebuildResult, SearchResult, TagCount, TaskDateInfo, ViewNotePreview,
};

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

pub(crate) fn parse_raw_search_query(
    raw_query: &str,
    limit: Option<u32>,
) -> SearchAdvancedRequest {
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

fn fetch_previews_by_ids(
    conn: &rusqlite::Connection,
    ids: &[String],
) -> Result<std::collections::HashMap<String, String>, String> {
    if ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    let placeholders = std::iter::repeat_n("?", ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!("SELECT id, preview FROM notes WHERE id IN ({placeholders})");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params = rusqlite::params_from_iter(ids.iter());
    let mut rows = stmt.query(params).map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::<String, String>::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        map.insert(
            row.get::<_, String>(0).map_err(|e| e.to_string())?,
            row.get::<_, String>(1).map_err(|e| e.to_string())?,
        );
    }
    Ok(map)
}

#[tauri::command]
pub async fn index_rebuild(
    app: AppHandle,
    state: State<'_, VaultState>,
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
    state: State<'_, VaultState>,
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
    state: State<'_, VaultState>,
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
    state: State<'_, VaultState>,
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
pub async fn search_view_data(
    state: State<'_, VaultState>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<ViewNotePreview>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<ViewNotePreview>, String> {
        let lim = limit.unwrap_or(200).clamp(1, 2_000) as usize;
        let conn = open_db(&root)?;
        let results = hybrid_search(&conn, &query, &[], lim as i64)?;
        let ids = results
            .iter()
            .map(|r| r.id.clone())
            .filter(|id| !id.trim().is_empty())
            .collect::<Vec<_>>();
        let preview_by_id = fetch_previews_by_ids(&conn, &ids)?;
        Ok(results
            .into_iter()
            .take(lim)
            .map(|r| ViewNotePreview {
                id: r.id.clone(),
                title: r.title,
                content: preview_by_id.get(&r.id).cloned().unwrap_or(r.snippet),
            })
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn search_with_tags(
    state: State<'_, VaultState>,
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
    state: State<'_, VaultState>,
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

#[tauri::command]
pub async fn tags_list(
    state: State<'_, VaultState>,
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
    state: State<'_, VaultState>,
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
pub async fn tag_view_data(
    state: State<'_, VaultState>,
    tag: String,
    limit: Option<u32>,
) -> Result<Vec<ViewNotePreview>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<ViewNotePreview>, String> {
        let lim = limit.unwrap_or(500).clamp(1, 2_000) as usize;
        let t = normalize_tag(&tag).ok_or_else(|| "invalid tag".to_string())?;
        let conn = open_db(&root)?;
        let mut stmt = conn
            .prepare(
                "SELECT n.id, n.title, n.preview AS snippet, 0.0 AS score
                 FROM tags t
                 JOIN notes n ON n.id = t.note_id
                 WHERE t.tag = ?
                 ORDER BY n.updated DESC
                 LIMIT ?",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(rusqlite::params![t, lim as i64])
            .map_err(|e| e.to_string())?;
        let mut out: Vec<ViewNotePreview> = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            out.push(ViewNotePreview {
                id: row.get(0).map_err(|e| e.to_string())?,
                title: row.get(1).map_err(|e| e.to_string())?,
                content: row.get(2).map_err(|e| e.to_string())?,
            });
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn tasks_query(
    state: State<'_, VaultState>,
    bucket: String,
    today: String,
    limit: Option<u32>,
) -> Result<Vec<IndexedTask>, String> {
    let root = state.current_root()?;
    let bucket = TaskBucket::parse(&bucket)?;
    let limit = limit.unwrap_or(500).min(5_000) as i64;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<IndexedTask>, String> {
        let conn = open_db(&root)?;
        query_tasks(&conn, bucket, &today, limit)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn task_set_checked(
    state: State<'_, VaultState>,
    task_id: String,
    checked: bool,
) -> Result<(), String> {
    let root = state.current_root()?;
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
        write_note(&abs, &next)?;
        let _ = index_note(&root, &note_id, &next);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn task_set_dates(
    state: State<'_, VaultState>,
    task_id: String,
    scheduled_date: Option<String>,
    due_date: Option<String>,
) -> Result<(), String> {
    let root = state.current_root()?;
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
    state: State<'_, VaultState>,
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
