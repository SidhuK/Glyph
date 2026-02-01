use crate::{tether_paths, vault::VaultState};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    ffi::OsStr,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, State};
use tauri_plugin_notification::NotificationExt;

#[derive(Serialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

#[derive(Serialize)]
pub struct IndexRebuildResult {
    pub indexed: usize,
}

#[derive(Serialize)]
pub struct BacklinkItem {
    pub id: String,
    pub title: String,
    pub updated: String,
}

#[derive(Serialize)]
pub struct TagCount {
    pub tag: String,
    pub count: u32,
}

fn db_path(vault_root: &Path) -> Result<PathBuf, String> {
    tether_paths::tether_db_path(vault_root)
}

fn now_sqlite_compatible_iso8601() -> String {
    // We already store RFC3339 in frontmatter; use that.
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    hex::encode(h.finalize())
}

fn split_frontmatter(markdown: &str) -> (&str, &str) {
    // Returns (frontmatter_yaml_or_empty, body)
    if let Some(rest) = markdown.strip_prefix("---\n") {
        if let Some(idx) = rest.find("\n---\n") {
            let fm = &rest[..idx];
            let body = &rest[idx + "\n---\n".len()..];
            return (fm, body);
        }
        if let Some(idx) = rest.find("\n---\r\n") {
            let fm = &rest[..idx];
            let body = &rest[idx + "\n---\r\n".len()..];
            return (fm, body);
        }
    }
    if let Some(rest) = markdown.strip_prefix("---\r\n") {
        if let Some(idx) = rest.find("\r\n---\r\n") {
            let fm = &rest[..idx];
            let body = &rest[idx + "\r\n---\r\n".len()..];
            return (fm, body);
        }
        if let Some(idx) = rest.find("\r\n---\n") {
            let fm = &rest[..idx];
            let body = &rest[idx + "\r\n---\n".len()..];
            return (fm, body);
        }
    }
    ("", markdown)
}

#[derive(Default, Deserialize)]
struct Frontmatter {
    title: Option<String>,
    created: Option<String>,
    updated: Option<String>,
}

fn parse_frontmatter_title_created_updated(markdown: &str) -> (String, String, String) {
    let (yaml, _body) = split_frontmatter(markdown);
    if yaml.is_empty() {
        let now = now_sqlite_compatible_iso8601();
        return ("Untitled".to_string(), now.clone(), now);
    }
    let fm: Result<Frontmatter, _> = serde_yaml::from_str(yaml);
    let now = now_sqlite_compatible_iso8601();
    match fm {
        Ok(fm) => (
            fm.title.unwrap_or_else(|| "Untitled".to_string()),
            fm.created.unwrap_or_else(|| now.clone()),
            fm.updated.unwrap_or_else(|| now),
        ),
        Err(_) => ("Untitled".to_string(), now.clone(), now),
    }
}

fn normalize_tag(raw: &str) -> Option<String> {
    let t = raw.trim();
    if t.is_empty() {
        return None;
    }
    let t = t.strip_prefix('#').unwrap_or(t).trim();
    if t.is_empty() {
        return None;
    }
    // Obsidian allows nested tags with `/`. Keep `/`, `_`, `-`.
    // Normalize to lowercase to avoid duplicates.
    let t = t.to_lowercase();
    if t.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '/')
    {
        Some(t)
    } else {
        None
    }
}

fn parse_frontmatter_tags(markdown: &str) -> Vec<String> {
    let (yaml, _body) = split_frontmatter(markdown);
    if yaml.is_empty() {
        return Vec::new();
    }
    let v: serde_yaml::Value = match serde_yaml::from_str(yaml) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let tags_val = match v.get("tags") {
        Some(t) => t,
        None => return Vec::new(),
    };
    let mut out = Vec::new();
    match tags_val {
        serde_yaml::Value::Sequence(items) => {
            for it in items {
                if let serde_yaml::Value::String(s) = it {
                    if let Some(t) = normalize_tag(s) {
                        out.push(t);
                    }
                }
            }
        }
        serde_yaml::Value::String(s) => {
            // Support "a, b" or "a b" in frontmatter.
            let parts = if s.contains(',') {
                s.split(',').map(|p| p.trim()).collect::<Vec<_>>()
            } else {
                s.split_whitespace().collect::<Vec<_>>()
            };
            for p in parts {
                if let Some(t) = normalize_tag(p) {
                    out.push(t);
                }
            }
        }
        _ => {}
    }
    out.sort();
    out.dedup();
    out
}

fn parse_inline_tags(markdown: &str) -> Vec<String> {
    // Best-effort parser: find `#tag` outside fenced code blocks and inline code.
    // We deliberately keep it conservative to avoid false positives.
    let mut out: Vec<String> = Vec::new();
    let mut in_fence = false;
    for line in markdown.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        // Strip inline code spans by removing backticked segments.
        let mut cleaned = String::new();
        let mut in_code = false;
        for ch in line.chars() {
            if ch == '`' {
                in_code = !in_code;
                continue;
            }
            if !in_code {
                cleaned.push(ch);
            }
        }

        let bytes = cleaned.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'#' {
                let prev = if i == 0 { b' ' } else { bytes[i - 1] };
                let prev_ok = !(prev as char).is_ascii_alphanumeric() && prev != b'/' && prev != b'_';
                if !prev_ok {
                    i += 1;
                    continue;
                }
                let mut j = i + 1;
                while j < bytes.len() {
                    let c = bytes[j] as char;
                    if c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '/' {
                        j += 1;
                        continue;
                    }
                    break;
                }
                if j > i + 1 {
                    let candidate = &cleaned[i + 1..j];
                    if let Some(t) = normalize_tag(candidate) {
                        out.push(t);
                    }
                }
                i = j;
                continue;
            }
            i += 1;
        }
    }
    out.sort();
    out.dedup();
    out
}

fn parse_all_tags(markdown: &str) -> Vec<String> {
    let mut out = parse_frontmatter_tags(markdown);
    out.extend(parse_inline_tags(markdown));
    out.sort();
    out.dedup();
    out
}

fn should_skip_entry(name: &OsStr) -> bool {
    name.to_string_lossy().starts_with('.')
}

fn path_to_slash_string(rel: &Path) -> String {
    rel.components()
        .filter_map(|c| c.as_os_str().to_str())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("/")
}

fn collect_markdown_files(vault_root: &Path) -> Result<Vec<(String, PathBuf)>, String> {
    let mut out: Vec<(String, PathBuf)> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![vault_root.to_path_buf()];

    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let name = entry.file_name();
            if should_skip_entry(&name) {
                continue;
            }
            let path = entry.path();
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_dir() {
                stack.push(path);
                continue;
            }
            if !meta.is_file() {
                continue;
            }
            if path.extension() != Some(OsStr::new("md")) {
                continue;
            }
            let rel = match path.strip_prefix(vault_root) {
                Ok(r) => r,
                Err(_) => continue,
            };
            let rel_s = path_to_slash_string(rel);
            if rel_s.is_empty() {
                continue;
            }
            out.push((rel_s, path));
        }
    }

    out.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
    Ok(out)
}

fn normalize_rel_path(raw: &str) -> Option<String> {
    let raw = raw.replace('\\', "/");
    let raw = raw.trim().trim_matches('/');
    if raw.is_empty() {
        return None;
    }
    let mut out: Vec<String> = Vec::new();
    for part in raw.split('/') {
        let part = part.trim();
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            if out.pop().is_none() {
                return None;
            }
            continue;
        }
        if part.starts_with('.') {
            return None;
        }
        out.push(part.to_string());
    }
    if out.is_empty() {
        None
    } else {
        Some(out.join("/"))
    }
}

fn parse_outgoing_links(from_rel_path: &str, markdown: &str) -> (HashSet<String>, HashSet<String>) {
    // Returns (to_paths, to_titles_unresolved)
    let mut paths = HashSet::new();
    let mut titles = HashSet::new();

    let from_dir = Path::new(from_rel_path).parent().unwrap_or_else(|| Path::new(""));
    let from_dir = from_dir.to_string_lossy().replace('\\', "/");

    // Wikilinks: [[...]] (support alias `|` and headings `#`)
    let mut i = 0;
    let bytes = markdown.as_bytes();
    while i + 4 <= bytes.len() {
        if bytes[i] == b'[' && bytes[i + 1] == b'[' {
            if let Some(end) = markdown[i + 2..].find("]]") {
                let inner = &markdown[i + 2..i + 2 + end];
                let inner = inner.trim();
                let inner = inner.split('|').next().unwrap_or(inner).trim();
                let inner = inner.split('#').next().unwrap_or(inner).trim();
                if !inner.is_empty() {
                    if inner.contains('/') || inner.ends_with(".md") {
                        let p = if inner.ends_with(".md") {
                            inner.to_string()
                        } else {
                            format!("{inner}.md")
                        };
                        if let Some(p) = normalize_rel_path(&p) {
                            paths.insert(p);
                        }
                    } else {
                        titles.insert(inner.to_string());
                    }
                }
                i = i + 2 + end + 2;
                continue;
            }
        }
        i += 1;
    }

    // Markdown links: ...(<target>)
    let mut j = 0;
    while let Some(start) = markdown[j..].find("](") {
        let open = j + start + 2;
        if let Some(close_rel) = markdown[open..].find(')') {
            let close = open + close_rel;
            let mut target = markdown[open..close].trim().trim_matches('<').trim_matches('>');
            if let Some(hash) = target.find('#') {
                target = &target[..hash];
            }
            if let Some(q) = target.find('?') {
                target = &target[..q];
            }
            if target.starts_with("http://")
                || target.starts_with("https://")
                || target.starts_with("mailto:")
            {
                j = close + 1;
                continue;
            }
            if !target.ends_with(".md") {
                j = close + 1;
                continue;
            }

            let raw_rel = if target.starts_with('/') {
                target.trim_start_matches('/').to_string()
            } else if from_dir.is_empty() {
                target.to_string()
            } else {
                format!("{from_dir}/{target}")
            };
            if let Some(p) = normalize_rel_path(&raw_rel) {
                paths.insert(p);
            }

            j = close + 1;
            continue;
        }
        break;
    }

    (paths, titles)
}

fn ensure_schema(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canvases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  updated TEXT NOT NULL,
  doc_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created TEXT NOT NULL,
  updated TEXT NOT NULL,
  path TEXT NOT NULL,
  etag TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS links (
  from_id TEXT NOT NULL,
  to_id TEXT,
  to_title TEXT,
  kind TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id, to_title, kind)
);

CREATE INDEX IF NOT EXISTS links_to_id_idx ON links(to_id);

CREATE TABLE IF NOT EXISTS tags (
  note_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (note_id, tag)
);

CREATE INDEX IF NOT EXISTS tags_tag_idx ON tags(tag);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  id UNINDEXED,
  title,
  body,
  tokenize = 'porter'
);
"#,
    )
    .map_err(|e| e.to_string())?;

    let schema_version: Option<String> = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'schema_version' LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();
    if schema_version.as_deref() != Some("2") {
        // Preserve existing DBs; tags table is additive and created with IF NOT EXISTS.
        conn.execute("INSERT OR REPLACE INTO meta(key, value) VALUES('schema_version', '2')", [])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub(crate) fn open_db(vault_root: &Path) -> Result<rusqlite::Connection, String> {
    let path = db_path(vault_root)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = rusqlite::Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    ensure_schema(&conn)?;
    Ok(conn)
}

pub fn index_note(vault_root: &Path, note_id: &str, markdown: &str) -> Result<(), String> {
    let conn = open_db(vault_root)?;
    index_note_with_conn(&conn, note_id, markdown)
}

fn resolve_title_to_id(conn: &rusqlite::Connection, title: &str) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM notes WHERE lower(title) = lower(?) LIMIT 2")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([title]).map_err(|e| e.to_string())?;
    let first: Option<String> = match rows.next().map_err(|e| e.to_string())? {
        None => None,
        Some(r) => Some(r.get(0).map_err(|e| e.to_string())?),
    };
    let second = rows.next().map_err(|e| e.to_string())?;
    if first.is_some() && second.is_none() {
        Ok(first)
    } else {
        Ok(None)
    }
}

fn index_note_with_conn(
    conn: &rusqlite::Connection,
    note_id: &str,
    markdown: &str,
) -> Result<(), String> {
    let (mut title, created, updated) = parse_frontmatter_title_created_updated(markdown);
    if title == "Untitled" {
        if let Some(stem) = Path::new(note_id)
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            title = stem.to_string();
        }
    }
    let title_for_fts = title.clone();
    let etag = sha256_hex(markdown.as_bytes());
    let rel_path = note_id.to_string();

    conn.execute(
        "INSERT OR REPLACE INTO notes(id, title, created, updated, path, etag) VALUES(?, ?, ?, ?, ?, ?)",
        rusqlite::params![note_id, title, created, updated, rel_path, etag],
    )
    .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM notes_fts WHERE id = ?", [note_id])
        .map_err(|e| e.to_string())?;
    let (_yaml, body) = split_frontmatter(markdown);
    conn.execute(
        "INSERT INTO notes_fts(id, title, body) VALUES(?, ?, ?)",
        rusqlite::params![note_id, title_for_fts, body],
    )
    .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM links WHERE from_id = ?", [note_id])
        .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM tags WHERE note_id = ?", [note_id])
        .map_err(|e| e.to_string())?;

    for tag in parse_all_tags(markdown) {
        conn.execute(
            "INSERT OR IGNORE INTO tags(note_id, tag) VALUES(?, ?)",
            rusqlite::params![note_id, tag],
        )
        .map_err(|e| e.to_string())?;
    }

    let (to_ids, to_titles) = parse_outgoing_links(note_id, markdown);
    let mut inserted = HashSet::<(Option<String>, Option<String>, &'static str)>::new();

    for to_id in to_ids {
        inserted.insert((Some(to_id), None, "note"));
    }

    for to_title in to_titles {
        if let Some(to_id) = resolve_title_to_id(conn, &to_title)? {
            inserted.insert((Some(to_id), None, "note"));
        } else {
            inserted.insert((None, Some(to_title), "wikilink"));
        }
    }

    for (to_id, to_title, kind) in inserted {
        conn.execute(
            "INSERT OR IGNORE INTO links(from_id, to_id, to_title, kind) VALUES(?, ?, ?, ?)",
            rusqlite::params![note_id, to_id, to_title, kind],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn remove_note(vault_root: &Path, note_id: &str) -> Result<(), String> {
    let conn = open_db(vault_root)?;
    conn.execute("DELETE FROM notes WHERE id = ?", [note_id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes_fts WHERE id = ?", [note_id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM links WHERE from_id = ? OR to_id = ?", rusqlite::params![note_id, note_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn rebuild(vault_root: &Path) -> Result<IndexRebuildResult, String> {
    let mut conn = open_db(vault_root)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Rebuild is derived; do not delete the DB file (it also stores non-derived data like canvases).
    tx.execute("DELETE FROM notes", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM notes_fts", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM links", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM tags", []).map_err(|e| e.to_string())?;

    let notes = collect_markdown_files(vault_root)?;

    // 1) Upsert note rows + FTS. (title resolution for wikilinks works better after notes exist)
    for (rel, path) in &notes {
        let markdown = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        let (mut title, created, updated) = parse_frontmatter_title_created_updated(&markdown);
        if title == "Untitled" {
            if let Some(stem) = Path::new(rel)
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                title = stem.to_string();
            }
        }
        let etag = sha256_hex(markdown.as_bytes());

        tx.execute(
            "INSERT OR REPLACE INTO notes(id, title, created, updated, path, etag) VALUES(?, ?, ?, ?, ?, ?)",
            rusqlite::params![rel, title, created, updated, rel, etag],
        )
        .map_err(|e| e.to_string())?;

        tx.execute("DELETE FROM notes_fts WHERE id = ?", [rel])
            .map_err(|e| e.to_string())?;
        let (_yaml, body) = split_frontmatter(&markdown);
        tx.execute(
            "INSERT INTO notes_fts(id, title, body) VALUES(?, ?, ?)",
            rusqlite::params![rel, title, body],
        )
        .map_err(|e| e.to_string())?;

        for tag in parse_all_tags(&markdown) {
            tx.execute(
                "INSERT OR IGNORE INTO tags(note_id, tag) VALUES(?, ?)",
                rusqlite::params![rel, tag],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // 2) Build links after all notes are present.
    for (rel, path) in &notes {
        let markdown = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        let (to_ids, to_titles) = parse_outgoing_links(rel, &markdown);

        let mut inserted = HashSet::<(Option<String>, Option<String>, &'static str)>::new();
        for to_id in to_ids {
            inserted.insert((Some(to_id), None, "file"));
        }
        for to_title in to_titles {
            if let Some(to_id) = resolve_title_to_id(&tx, &to_title)? {
                inserted.insert((Some(to_id), None, "file"));
            } else {
                inserted.insert((None, Some(to_title), "wikilink"));
            }
        }
        for (to_id, to_title, kind) in inserted {
            tx.execute(
                "INSERT OR IGNORE INTO links(from_id, to_id, to_title, kind) VALUES(?, ?, ?, ?)",
                rusqlite::params![rel, to_id, to_title, kind],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(IndexRebuildResult { indexed: notes.len() })
}

#[tauri::command]
pub async fn index_rebuild(app: AppHandle, state: State<'_, VaultState>) -> Result<IndexRebuildResult, String> {
    let root = state.current_root()?;
    let res = tauri::async_runtime::spawn_blocking(move || rebuild(&root))
        .await
        .map_err(|e| e.to_string())??;
    let _ = app
        .notification()
        .builder()
        .title("Tether")
        .body(format!("Index rebuilt ({})", res.indexed))
        .show();
    Ok(res)
}

#[tauri::command]
pub async fn search(state: State<'_, VaultState>, query: String) -> Result<Vec<SearchResult>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<SearchResult>, String> {
        let q = query.trim();
        if q.is_empty() {
            return Ok(Vec::new());
        }
        let conn = open_db(&root)?;
        let mut stmt = conn
            .prepare(
                "SELECT id, title, snippet(notes_fts, 2, '⟦', '⟧', '…', 10) AS snip, bm25(notes_fts) AS score
                 FROM notes_fts
                 WHERE notes_fts MATCH ?
                 ORDER BY score
                 LIMIT 50",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([q]).map_err(|e| e.to_string())?;
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
pub async fn tags_list(state: State<'_, VaultState>, limit: Option<u32>) -> Result<Vec<TagCount>, String> {
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
pub async fn tag_notes(state: State<'_, VaultState>, tag: String, limit: Option<u32>) -> Result<Vec<SearchResult>, String> {
    let root = state.current_root()?;
    let limit = limit.unwrap_or(500).min(10_000) as i64;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<SearchResult>, String> {
        let t = normalize_tag(&tag).ok_or_else(|| "invalid tag".to_string())?;
        let conn = open_db(&root)?;
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
        let mut rows = stmt.query(rusqlite::params![t, limit]).map_err(|e| e.to_string())?;
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
pub async fn backlinks(state: State<'_, VaultState>, note_id: String) -> Result<Vec<BacklinkItem>, String> {
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
