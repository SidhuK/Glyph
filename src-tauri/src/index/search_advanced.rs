use std::path::Path;

use serde::Deserialize;

use rusqlite::Connection;

use super::search_hybrid::{hybrid_search, metadata_search};
use super::tags::normalize_tag;
use super::types::SearchResult;

#[derive(Deserialize, Clone, Default)]
pub struct SearchAdvancedRequest {
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub title_only: bool,
    #[serde(default)]
    pub tag_only: bool,
    #[serde(default)]
    pub limit: Option<u32>,
}

pub fn run_search_advanced(
    space_root: &Path,
    conn: &Connection,
    req: SearchAdvancedRequest,
) -> Result<Vec<SearchResult>, String> {
    let limit = req.limit.unwrap_or(200).clamp(1, 2_000) as usize;
    let text = req.query.unwrap_or_default().trim().to_string();
    let mut tags = normalize_tags(req.tags)?;
    if req.tag_only {
        for token in text.split_whitespace() {
            let normalized = normalize_tag(token).or_else(|| normalize_tag(&format!("#{token}")));
            if let Some(tag) = normalized {
                if !tags.contains(&tag) {
                    tags.push(tag);
                }
            }
        }
    }

    let query_text = if req.tag_only { String::new() } else { text };

    let mut out = if !query_text.is_empty() && !req.title_only {
        hybrid_search(
            conn,
            space_root,
            &query_text,
            &tags,
            (limit as i64 * 8).clamp(200, 5_000),
        )?
    } else {
        metadata_search(
            conn,
            &query_text,
            &tags,
            (limit as i64 * 8).clamp(200, 5_000),
        )?
    };

    if out.len() > limit {
        out.truncate(limit);
    }
    Ok(out)
}

fn normalize_tags(tags: Vec<String>) -> Result<Vec<String>, String> {
    let mut out = Vec::<String>::new();
    for raw in tags {
        let t = normalize_tag(&raw).ok_or_else(|| "invalid tag".to_string())?;
        if !out.contains(&t) {
            out.push(t);
        }
    }
    Ok(out)
}
