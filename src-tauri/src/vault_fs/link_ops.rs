use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::State;

use crate::{paths, utils, vault::VaultState};

#[derive(Clone)]
struct FileEntry {
    rel_path: String,
    is_markdown: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct LinkSuggestionItem {
    pub path: String,
    pub title: String,
    pub insert_text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct LinkSuggestRequest {
    pub query: String,
    pub source_path: Option<String>,
    pub markdown_only: Option<bool>,
    pub strip_markdown_ext: Option<bool>,
    pub relative_to_source: Option<bool>,
    pub limit: Option<u32>,
}

fn normalize(input: &str) -> String {
    input.to_lowercase().trim().replace('\\', "/")
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/").trim_matches('/').to_string()
}

fn should_hide(name: &str) -> bool {
    name.starts_with('.') || name.eq_ignore_ascii_case("node_modules")
}

fn basename(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path).to_string()
}

fn title_from_rel(path: &str) -> String {
    basename(path)
        .trim_end_matches(".md")
        .trim_end_matches(".MD")
        .to_string()
}

fn normalize_segments(path: &str) -> String {
    let mut stack: Vec<&str> = Vec::new();
    for part in path.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            let _ = stack.pop();
            continue;
        }
        stack.push(part);
    }
    stack.join("/")
}

fn parent_dir(path: &str) -> String {
    let p = normalize_path(path);
    match p.rsplit_once('/') {
        Some((left, _)) => left.to_string(),
        None => String::new(),
    }
}

fn relative_path(from_dir: &str, to_path: &str) -> String {
    let from: Vec<&str> = from_dir.split('/').filter(|s| !s.is_empty()).collect();
    let to: Vec<&str> = to_path.split('/').filter(|s| !s.is_empty()).collect();
    let mut i = 0;
    while i < from.len() && i < to.len() && from[i] == to[i] {
        i += 1;
    }
    let mut out: Vec<String> = vec!["..".to_string(); from.len().saturating_sub(i)];
    out.extend(to[i..].iter().map(|s| s.to_string()));
    if out.is_empty() {
        ".".to_string()
    } else {
        out.join("/")
    }
}

fn list_files(root: &Path, markdown_only: bool, limit: usize) -> Result<Vec<FileEntry>, String> {
    let mut out: Vec<FileEntry> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![PathBuf::new()];
    while let Some(rel_dir) = stack.pop() {
        let abs = paths::join_under(root, &rel_dir)?;
        let entries = match std::fs::read_dir(abs) {
            Ok(v) => v,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if should_hide(&name) {
                continue;
            }
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let child_rel = rel_dir.join(&name);
            if meta.is_dir() {
                stack.push(child_rel);
                continue;
            }
            if !meta.is_file() {
                continue;
            }
            let rel = utils::to_slash(&child_rel);
            let md = utils::is_markdown_path(Path::new(&rel));
            if markdown_only && !md {
                continue;
            }
            out.push(FileEntry {
                rel_path: rel,
                is_markdown: md,
            });
            if out.len() >= limit {
                break;
            }
        }
        if out.len() >= limit {
            break;
        }
    }
    out.sort_by_cached_key(|e| e.rel_path.to_lowercase());
    Ok(out)
}

#[tauri::command]
pub async fn vault_resolve_wikilink(
    state: State<'_, VaultState>,
    target: String,
) -> Result<Option<String>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || {
        let entries = list_files(&root, true, 50_000)?;
        let norm = normalize_path(&target).trim_start_matches("./").to_string();
        let lowered = normalize(norm.trim_end_matches(".md"));
        if lowered.is_empty() {
            return Ok(None);
        }
        if let Some(hit) = entries
            .iter()
            .find(|e| normalize(e.rel_path.trim_end_matches(".md")) == lowered)
        {
            return Ok(Some(hit.rel_path.clone()));
        }
        if let Some(hit) = entries
            .iter()
            .find(|e| normalize(&title_from_rel(&e.rel_path)) == lowered)
        {
            return Ok(Some(hit.rel_path.clone()));
        }
        if let Some(hit) = entries.iter().find(|e| {
            normalize(e.rel_path.trim_end_matches(".md")).ends_with(&format!("/{lowered}"))
        }) {
            return Ok(Some(hit.rel_path.clone()));
        }
        Ok(None)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn vault_resolve_markdown_link(
    state: State<'_, VaultState>,
    href: String,
    source_path: String,
) -> Result<Option<String>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || {
        let entries = list_files(&root, false, 80_000)?;
        let raw = href
            .split('#')
            .next()
            .unwrap_or("")
            .trim()
            .replace('\\', "/");
        if raw.is_empty() || raw.starts_with("http://") || raw.starts_with("https://") {
            return Ok(None);
        }
        let source_dir = parent_dir(&source_path);
        let normalized_raw = raw.trim_start_matches("./");
        let mut candidates = Vec::<String>::new();
        if raw.starts_with('/') {
            candidates.push(normalize_segments(&raw));
        } else {
            candidates.push(normalize_segments(&format!(
                "{source_dir}/{normalized_raw}"
            )));
            candidates.push(normalize_segments(normalized_raw));
        }
        let mut expanded = candidates.clone();
        for c in &candidates {
            if !c.to_lowercase().ends_with(".md") {
                expanded.push(format!("{c}.md"));
            }
        }
        for c in expanded {
            if let Some(hit) = entries
                .iter()
                .find(|e| normalize_path(&e.rel_path).eq_ignore_ascii_case(&c))
            {
                return Ok(Some(hit.rel_path.clone()));
            }
        }
        Ok(None)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn vault_suggest_links(
    state: State<'_, VaultState>,
    request: LinkSuggestRequest,
) -> Result<Vec<LinkSuggestionItem>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || {
        let markdown_only = request.markdown_only.unwrap_or(false);
        let strip_md = request.strip_markdown_ext.unwrap_or(false);
        let relative = request.relative_to_source.unwrap_or(false);
        let limit = request.limit.unwrap_or(10).clamp(1, 200) as usize;
        let source_dir = request
            .source_path
            .as_deref()
            .map(parent_dir)
            .unwrap_or_default();
        let entries = list_files(&root, markdown_only, 100_000)?;
        let q = normalize(&request.query);

        let mut rows: Vec<(i32, LinkSuggestionItem)> = Vec::new();
        for entry in entries {
            if markdown_only && !entry.is_markdown {
                continue;
            }
            let title = title_from_rel(&entry.rel_path);
            let mut insert_text = if relative {
                relative_path(&source_dir, &entry.rel_path)
            } else {
                entry.rel_path.clone()
            };
            if strip_md && insert_text.to_lowercase().ends_with(".md") {
                let len = insert_text.len().saturating_sub(3);
                insert_text = insert_text[..len].to_string();
            }

            let score = if q.is_empty() {
                1
            } else {
                let title_n = normalize(&title);
                let path_n = normalize(&entry.rel_path);
                let insert_n = normalize(&insert_text);
                (if title_n.starts_with(&q) { 20 } else { 0 })
                    + (if insert_n.starts_with(&q) { 16 } else { 0 })
                    + (if path_n.starts_with(&q) { 12 } else { 0 })
                    + (if title_n.contains(&q) { 6 } else { 0 })
                    + (if insert_n.contains(&q) { 4 } else { 0 })
                    + (if path_n.contains(&q) { 2 } else { 0 })
            };
            if score <= 0 {
                continue;
            }
            rows.push((
                score,
                LinkSuggestionItem {
                    path: entry.rel_path,
                    title,
                    insert_text,
                },
            ));
        }

        rows.sort_by(|a, b| {
            b.0.cmp(&a.0)
                .then_with(|| a.1.path.to_lowercase().cmp(&b.1.path.to_lowercase()))
        });
        Ok(rows.into_iter().take(limit).map(|r| r.1).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}
