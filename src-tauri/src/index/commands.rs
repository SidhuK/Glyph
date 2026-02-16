use std::path::Path;
use tauri::{AppHandle, State};
use tauri_plugin_notification::NotificationExt;

use crate::vault::VaultState;

use super::db::open_db;
use super::indexer::index_note;
use super::indexer::rebuild;
use super::search_hybrid::hybrid_search;
use super::tags::normalize_tag;
use super::tasks::{
    mutate_task_line, note_abs_path, query_tasks, write_note, IndexedTask, TaskBucket,
};
use super::types::{BacklinkItem, IndexNotePreview, IndexRebuildResult, SearchResult, TagCount};

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
        .title("Lattice")
        .body(format!("Index rebuilt ({})", res.indexed))
        .show();
    Ok(res)
}

#[tauri::command]
pub async fn index_note_previews_batch(
    state: State<'_, VaultState>,
    ids: Vec<String>,
) -> Result<Vec<IndexNotePreview>, String> {
    const MAX_IDS: usize = 20_000;
    const CHUNK: usize = 400;

    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<IndexNotePreview>, String> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        if ids.len() > MAX_IDS {
            return Err("too many ids".to_string());
        }

        let mut seen = std::collections::HashSet::<String>::new();
        let mut uniq: Vec<String> = Vec::with_capacity(ids.len());
        for id in ids {
            if id.trim().is_empty() {
                continue;
            }
            if seen.insert(id.clone()) {
                uniq.push(id);
            }
        }

        let conn = open_db(&root)?;
        let mut out: Vec<IndexNotePreview> = Vec::new();

        for chunk in uniq.chunks(CHUNK) {
            let placeholders = std::iter::repeat("?")
                .take(chunk.len())
                .collect::<Vec<_>>()
                .join(", ");
            let sql = format!("SELECT id, title, preview FROM notes WHERE id IN ({placeholders})");

            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let params = rusqlite::params_from_iter(chunk.iter());
            let mut rows = stmt.query(params).map_err(|e| e.to_string())?;
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                out.push(IndexNotePreview {
                    id: row.get(0).map_err(|e| e.to_string())?,
                    title: row.get(1).map_err(|e| e.to_string())?,
                    preview: row.get(2).map_err(|e| e.to_string())?,
                });
            }
        }

        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
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
            return Ok(out);
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
            return Ok(out);
        }
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
