use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::utils;

use super::frontmatter::{parse_frontmatter_title_created_updated, split_frontmatter};
use super::helpers::{path_to_slash_string, should_skip_entry};
use super::types::SearchResult;

const DEFAULT_SCAN_LIMIT: usize = 10_000;
const MAX_FILE_BYTES: u64 = 1024 * 1024;

#[derive(Clone)]
struct MetadataCandidate {
    id: String,
    title: String,
    path: String,
    score: f64,
}

fn tokenize_query(query: &str) -> Vec<String> {
    query
        .split(|c: char| !c.is_alphanumeric())
        .map(str::trim)
        .filter(|t| t.len() >= 2)
        .map(|t| t.to_lowercase())
        .collect()
}

fn candidate_match_score(title: &str, path: &str, query_lc: &str, terms: &[String]) -> f64 {
    let title_lc = title.to_lowercase();
    let path_lc = path.to_lowercase();
    let file_name_lc = Path::new(path)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("")
        .to_lowercase();

    if !query_lc.is_empty() {
        if title_lc == query_lc {
            return 8.0;
        }
        if file_name_lc == query_lc {
            return 7.5;
        }
        if title_lc.starts_with(query_lc) {
            return 7.0;
        }
        if file_name_lc.starts_with(query_lc) {
            return 6.5;
        }
        if path_lc.ends_with(query_lc) {
            return 6.0;
        }
    }

    let mut score = 0.0;
    for term in terms {
        if title_lc.contains(term) {
            score += 2.0;
        }
        if file_name_lc.contains(term) {
            score += 1.7;
        }
        if path_lc.contains(term) {
            score += 1.0;
        }
    }
    score
}

fn metadata_candidates(
    conn: &Connection,
    query: &str,
    tags: &[String],
    limit: i64,
) -> Result<Vec<MetadataCandidate>, String> {
    let query_lc = query.trim().to_lowercase();
    let terms = tokenize_query(&query_lc);
    let mut sql = String::from("SELECT n.id, n.title, n.path FROM notes n ");
    for i in 0..tags.len() {
        sql.push_str(&format!(
            "JOIN tags t{idx} ON t{idx}.note_id = n.id AND t{idx}.tag = ? ",
            idx = i
        ));
    }
    sql.push_str("ORDER BY n.updated DESC LIMIT ?");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut params: Vec<rusqlite::types::Value> = tags
        .iter()
        .map(|tag| rusqlite::types::Value::from(tag.clone()))
        .collect();
    params.push(rusqlite::types::Value::from(limit.max(1)));

    let mut rows = stmt
        .query(rusqlite::params_from_iter(params.iter()))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let id: String = row.get(0).map_err(|e| e.to_string())?;
        let title: String = row.get(1).map_err(|e| e.to_string())?;
        let path: String = row.get(2).map_err(|e| e.to_string())?;
        let score = if query_lc.is_empty() {
            1.0
        } else {
            candidate_match_score(&title, &path, &query_lc, &terms)
        };
        if query_lc.is_empty() || score > 0.0 {
            out.push(MetadataCandidate {
                id,
                title,
                path,
                score,
            });
        }
    }
    Ok(out)
}

pub fn metadata_note_ids_for_tags(
    conn: &Connection,
    tags: &[String],
) -> Result<Option<HashSet<String>>, String> {
    if tags.is_empty() {
        return Ok(None);
    }
    let candidates = metadata_candidates(conn, "", tags, 50_000)?;
    Ok(Some(
        candidates
            .into_iter()
            .map(|candidate| candidate.id)
            .collect(),
    ))
}

fn find_highlight_span(line: &str, query_lc: &str, terms: &[String]) -> Option<(usize, usize)> {
    let line_lc = line.to_lowercase();
    if !query_lc.is_empty() {
        if let Some(idx) = line_lc.find(query_lc) {
            return Some((idx, idx + query_lc.len()));
        }
    }
    for term in terms {
        if let Some(idx) = line_lc.find(term) {
            return Some((idx, idx + term.len()));
        }
    }
    None
}

fn highlight_line(line: &str, query_lc: &str, terms: &[String]) -> Option<String> {
    let (start, end) = find_highlight_span(line, query_lc, terms)?;
    Some(format!(
        "{}⟦{}⟧{}",
        &line[..start],
        &line[start..end],
        &line[end..]
    ))
}

fn content_match(markdown: &str, query_lc: &str, terms: &[String]) -> Option<(String, f64)> {
    let (_yaml, body) = split_frontmatter(markdown);
    let body = body.trim();
    if body.is_empty() {
        return None;
    }

    for (idx, line) in body.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Some(snippet) = highlight_line(trimmed, query_lc, terms) else {
            continue;
        };
        let line_penalty = (idx.min(50) as f64) * 0.01;
        let phrase_bonus = if !query_lc.is_empty() && trimmed.to_lowercase().contains(query_lc) {
            1.5
        } else {
            0.0
        };
        let score = 4.0 + phrase_bonus - line_penalty;
        return Some((snippet, score.max(0.1)));
    }
    None
}

fn collect_markdown_files(
    space_root: &Path,
    allowed_ids: Option<&HashSet<String>>,
    scan_limit: usize,
) -> Result<Vec<(String, PathBuf)>, String> {
    if let Some(ids) = allowed_ids {
        let mut out = Vec::new();
        for id in ids {
            let abs = space_root.join(id);
            if abs.is_file() {
                out.push((id.clone(), abs));
            }
        }
        out.sort_by(|a, b| a.0.cmp(&b.0));
        return Ok(out);
    }

    let mut out = Vec::new();
    let mut stack = vec![space_root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            if should_skip_entry(&name) {
                continue;
            }
            let path = entry.path();
            let meta = match entry.metadata() {
                Ok(meta) => meta,
                Err(_) => continue,
            };
            if meta.is_dir() {
                stack.push(path);
                continue;
            }
            if !meta.is_file() || !utils::is_markdown_path(&path) {
                continue;
            }
            let rel = match path.strip_prefix(space_root) {
                Ok(rel) => rel,
                Err(_) => continue,
            };
            out.push((path_to_slash_string(rel), path));
            if out.len() >= scan_limit {
                return Ok(out);
            }
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

fn content_candidates(
    space_root: &Path,
    query: &str,
    allowed_ids: Option<&HashSet<String>>,
    limit: i64,
) -> Result<Vec<SearchResult>, String> {
    let query_lc = query.trim().to_lowercase();
    if query_lc.is_empty() {
        return Ok(Vec::new());
    }
    let terms = tokenize_query(&query_lc);
    let files = collect_markdown_files(space_root, allowed_ids, DEFAULT_SCAN_LIMIT)?;
    let mut out = Vec::new();

    for (rel, path) in files {
        let meta = match std::fs::metadata(&path) {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        if meta.len() > MAX_FILE_BYTES {
            continue;
        }
        let markdown = match std::fs::read_to_string(&path) {
            Ok(markdown) => markdown,
            Err(_) => continue,
        };
        let Some((snippet, score)) = content_match(&markdown, &query_lc, &terms) else {
            continue;
        };
        let (mut title, _created, _updated) =
            parse_frontmatter_title_created_updated(&markdown, &path);
        if title == "Untitled" {
            title = Path::new(&rel)
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or("Untitled")
                .to_string();
        }
        out.push(SearchResult {
            id: rel,
            title,
            snippet,
            score,
        });
        if out.len() >= limit.max(1) as usize {
            break;
        }
    }

    Ok(out)
}

pub fn metadata_search(
    conn: &Connection,
    query: &str,
    tags: &[String],
    limit: i64,
) -> Result<Vec<SearchResult>, String> {
    Ok(metadata_candidates(conn, query, tags, limit)?
        .into_iter()
        .map(|candidate| SearchResult {
            id: candidate.id,
            title: candidate.title,
            snippet: candidate.path,
            score: candidate.score,
        })
        .collect())
}

pub fn hybrid_search(
    conn: &Connection,
    space_root: &Path,
    query: &str,
    tags: &[String],
    limit: i64,
) -> Result<Vec<SearchResult>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() && tags.is_empty() {
        return Ok(Vec::new());
    }

    let mut ranked = HashMap::<String, SearchResult>::new();
    let metadata = metadata_candidates(conn, trimmed, tags, limit.max(200))?;
    for candidate in metadata {
        ranked.insert(
            candidate.id.clone(),
            SearchResult {
                id: candidate.id,
                title: candidate.title,
                snippet: candidate.path,
                score: candidate.score,
            },
        );
    }

    if !trimmed.is_empty() {
        let allowed_ids = metadata_note_ids_for_tags(conn, tags)?;
        for candidate in
            content_candidates(space_root, trimmed, allowed_ids.as_ref(), limit.max(200))?
        {
            if let Some(entry) = ranked.get_mut(&candidate.id) {
                entry.score += candidate.score;
                entry.snippet = candidate.snippet;
                if entry.title.trim().is_empty() {
                    entry.title = candidate.title;
                }
            } else {
                ranked.insert(candidate.id.clone(), candidate);
            }
        }
    }

    let mut out: Vec<SearchResult> = ranked.into_values().collect();
    out.sort_by(|a, b| b.score.total_cmp(&a.score).then_with(|| a.id.cmp(&b.id)));
    out.truncate(limit.max(1) as usize);
    Ok(out)
}
