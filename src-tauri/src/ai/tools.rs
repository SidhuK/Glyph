use std::{path::{Path, PathBuf}, time::UNIX_EPOCH};

use serde_json::{json, Value};

use crate::{index::open_db, paths};

const MAX_SEARCH_QUERY_CHARS: usize = 300;
const MAX_SEARCH_LIMIT: usize = 20;
const MAX_LIST_LIMIT: usize = 2_000;
const MAX_READ_BYTES: u64 = 32 * 1024;
const MAX_READ_CHARS: usize = 8_000;
const MAX_FALLBACK_FILE_BYTES: u64 = 256 * 1024;

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
        .unwrap_or(false)
}

fn deny_hidden_rel_path(rel: &Path) -> Result<(), String> {
    for c in rel.components() {
        if c.as_os_str().to_string_lossy().starts_with('.') { return Err("hidden paths are not accessible".to_string()); }
    }
    Ok(())
}

fn arg_limit(args: &Value, key: &str, default: usize, max: usize) -> usize {
    args.get(key).and_then(|v| v.as_u64()).and_then(|v| usize::try_from(v).ok()).unwrap_or(default).max(1).min(max)
}

pub async fn execute_tool_call(vault_root: &Path, name: &str, args: Value) -> Result<Value, String> {
    let root = vault_root.to_path_buf();
    match name {
        "search_vault" => search_vault(root, args).await,
        "list_files" => list_files(root, args).await,
        "read_file" => read_file(root, args).await,
        _ => Err("unknown tool".to_string()),
    }
}

async fn search_vault(root: PathBuf, args: Value) -> Result<Value, String> {
    let query = args.get("query").and_then(|v| v.as_str()).map(str::trim).unwrap_or("").to_string();
    if query.is_empty() { return Err("search_vault requires non-empty query".to_string()); }
    if query.chars().count() > MAX_SEARCH_QUERY_CHARS { return Err("query is too long".to_string()); }
    let limit = arg_limit(&args, "limit", 8, MAX_SEARCH_LIMIT) as i64;
    tauri::async_runtime::spawn_blocking(move || -> Result<Value, String> {
        let conn = open_db(&root)?;
        let mut results = Vec::new();
        if let Ok(mut stmt) = conn.prepare(
            "SELECT id, title, snippet(notes_fts, 2, '⟦', '⟧', '…', 10) AS snip, bm25(notes_fts) AS score
             FROM notes_fts WHERE notes_fts MATCH ? ORDER BY score LIMIT ?",
        ) {
            if let Ok(mut rows) = stmt.query(rusqlite::params![query, limit]) {
                while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                    results.push(json!({
                        "id": row.get::<_, String>(0).map_err(|e| e.to_string())?,
                        "title": row.get::<_, String>(1).map_err(|e| e.to_string())?,
                        "snippet": row.get::<_, String>(2).map_err(|e| e.to_string())?,
                        "score": row.get::<_, f64>(3).map_err(|e| e.to_string())?,
                    }));
                }
            }
        }
        if results.is_empty() {
            results = search_markdown_fallback(&root, &query, limit as usize);
        }
        Ok(json!({"query": query, "results": results}))
    }).await.map_err(|e| e.to_string())?
}

fn search_markdown_fallback(root: &Path, query: &str, limit: usize) -> Vec<Value> {
    let mut out = Vec::<Value>::new();
    let q = query.to_ascii_lowercase();
    let mut stack = vec![PathBuf::new()];
    while let Some(rel_dir) = stack.pop() {
        let abs_dir = match paths::join_under(root, &rel_dir) { Ok(v) => v, Err(_) => continue };
        let entries = match std::fs::read_dir(abs_dir) { Ok(v) => v, Err(_) => continue };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') { continue; }
            let rel = rel_dir.join(&name);
            let meta = match entry.metadata() { Ok(v) => v, Err(_) => continue };
            if meta.is_dir() { stack.push(rel); continue; }
            if !meta.is_file() || !is_markdown_path(&rel) || meta.len() > MAX_FALLBACK_FILE_BYTES { continue; }
            let text = match std::fs::read_to_string(entry.path()) { Ok(v) => v, Err(_) => continue };
            let text_l = text.to_ascii_lowercase();
            let title_l = name.to_ascii_lowercase();
            let text_hit = text_l.find(&q);
            let title_hit = title_l.find(&q);
            if text_hit.is_some() || title_hit.is_some() {
                let i = text_hit.unwrap_or(0);
                let start = i.saturating_sub(80);
                let end = (i + 220).min(text.len());
                let snippet = text.get(start..end).unwrap_or("").replace('\n', " ");
                out.push(json!({
                    "id": rel.to_string_lossy().to_string(),
                    "title": Path::new(&name).file_stem().and_then(|s| s.to_str()).unwrap_or(&name),
                    "snippet": snippet.trim(),
                    "score": 0.0,
                }));
                if out.len() >= limit { return out; }
            }
        }
    }
    out.sort_by(|a, b| a.get("id").and_then(|v| v.as_str()).unwrap_or("").cmp(b.get("id").and_then(|v| v.as_str()).unwrap_or("")));
    out
}

async fn list_files(root: PathBuf, args: Value) -> Result<Value, String> {
    let dir = args.get("dir").and_then(|v| v.as_str()).map(str::trim).unwrap_or("").to_string();
    let recursive = args.get("recursive").and_then(|v| v.as_bool()).unwrap_or(true);
    let markdown_only = args.get("markdown_only").and_then(|v| v.as_bool()).unwrap_or(false);
    let limit = arg_limit(&args, "limit", 50, MAX_LIST_LIMIT);

    tauri::async_runtime::spawn_blocking(move || -> Result<Value, String> {
        let start_rel = PathBuf::from(&dir);
        deny_hidden_rel_path(&start_rel)?;
        let start_abs = paths::join_under(&root, &start_rel)?;
        if !start_abs.exists() { return Ok(json!({"files": []})); }

        let mut out = Vec::<Value>::new();
        let mut stack = vec![start_rel];
        while let Some(rel_dir) = stack.pop() {
            let abs_dir = paths::join_under(&root, &rel_dir)?;
            let entries = match std::fs::read_dir(&abs_dir) { Ok(v) => v, Err(_) => continue };
            for entry in entries {
                let Ok(entry) = entry else { continue };
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') { continue; }
                let Ok(meta) = entry.metadata() else { continue };
                let child_rel = rel_dir.join(&name);
                if meta.is_dir() {
                    out.push(json!({
                        "name": name,
                        "rel_path": child_rel.to_string_lossy().to_string(),
                        "kind": "dir",
                        "is_markdown": false,
                    }));
                    if recursive { stack.push(child_rel); }
                    if out.len() >= limit { break; }
                    continue;
                }
                if !meta.is_file() { continue; }
                let is_markdown = is_markdown_path(&child_rel);
                if markdown_only && !is_markdown { continue; }
                let mtime_ms = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
                out.push(json!({
                    "name": name,
                    "rel_path": child_rel.to_string_lossy().to_string(),
                    "kind": "file",
                    "is_markdown": is_markdown,
                    "size_bytes": meta.len(),
                    "mtime_ms": mtime_ms,
                }));
                if out.len() >= limit { break; }
            }
            if out.len() >= limit { break; }
        }
        out.sort_by(|a, b| a.get("rel_path").and_then(|v| v.as_str()).unwrap_or("").cmp(b.get("rel_path").and_then(|v| v.as_str()).unwrap_or("")));
        Ok(json!({"files": out, "truncated": out.len() >= limit}))
    }).await.map_err(|e| e.to_string())?
}

async fn read_file(root: PathBuf, args: Value) -> Result<Value, String> {
    let path = args.get("path").and_then(|v| v.as_str()).map(str::trim).unwrap_or("").to_string();
    if path.is_empty() { return Err("read_file requires path".to_string()); }
    let max_chars = arg_limit(&args, "max_chars", 4_000, MAX_READ_CHARS);

    tauri::async_runtime::spawn_blocking(move || -> Result<Value, String> {
        let rel = PathBuf::from(&path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        if !abs.is_file() { return Err("path is not a file".to_string()); }
        let total_bytes = std::fs::metadata(&abs).map_err(|e| e.to_string())?.len();
        if total_bytes > MAX_READ_BYTES { return Err("file exceeds read cap".to_string()); }
        let text = String::from_utf8(std::fs::read(&abs).map_err(|e| e.to_string())?).map_err(|_| "file is not valid UTF-8".to_string())?;
        let mut out = String::new();
        let (mut total_chars, mut emitted) = (0usize, 0usize);
        for ch in text.chars() {
            total_chars += 1;
            if emitted < max_chars { out.push(ch); emitted += 1; }
        }
        Ok(json!({
            "rel_path": rel.to_string_lossy().to_string(),
            "text": out,
            "truncated": total_chars > max_chars,
            "total_chars": total_chars,
            "total_bytes": total_bytes,
        }))
    }).await.map_err(|e| e.to_string())?
}
