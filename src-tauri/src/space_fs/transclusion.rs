use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::Path};
use tauri::{State, WebviewWindow};

use crate::{paths, space::SpaceState};

use super::{
    link_ops::{list_files, resolve_standard_wikilink_target, LinkSuggestionItem},
    markdown_sections::{extract_heading_section, markdown_headings},
};

const BATCH_LIMIT: usize = 128;
const FILE_LIST_LIMIT: usize = 80_000;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransclusionAnchorKind {
    None,
    Heading,
    Block,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TransclusionRequest {
    pub key: String,
    pub target: String,
    pub anchor_kind: TransclusionAnchorKind,
    pub anchor: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TransclusionErrorKind {
    Unresolved,
    MissingHeading,
    UnsupportedBlock,
    ReadError,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct TransclusionResult {
    pub key: String,
    pub resolved_path: Option<String>,
    pub markdown: Option<String>,
    pub mtime_ms: Option<u64>,
    pub error_kind: Option<TransclusionErrorKind>,
}

impl TransclusionResult {
    fn error(
        key: String,
        resolved_path: Option<String>,
        mtime_ms: Option<u64>,
        error_kind: TransclusionErrorKind,
    ) -> Self {
        Self {
            key,
            resolved_path,
            markdown: None,
            mtime_ms,
            error_kind: Some(error_kind),
        }
    }
}

fn file_mtime_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or_default()
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_suggest_wikilink_headings(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    target: String,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<LinkSuggestionItem>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let entries = list_files(&root, true, FILE_LIST_LIMIT)?;
        let Some(resolved_path) = resolve_standard_wikilink_target(&entries, &target) else {
            return Ok(Vec::new());
        };
        let absolute = paths::join_under(&root, Path::new(&resolved_path))?;
        let markdown = std::fs::read_to_string(absolute).map_err(|error| error.to_string())?;
        let normalized_query = query.trim().to_lowercase();
        Ok(markdown_headings(&markdown)
            .into_iter()
            .filter(|heading| {
                !heading.slug.is_empty()
                    && (normalized_query.is_empty()
                        || heading.title.to_lowercase().contains(&normalized_query))
            })
            .take(limit.unwrap_or(8).clamp(1, 50) as usize)
            .map(|heading| {
                let anchor = heading.slug;
                LinkSuggestionItem {
                    path: format!("{target}#{anchor}"),
                    title: heading.title.to_string(),
                    insert_text: format!("{target}#{anchor}"),
                }
            })
            .collect())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_transclusions_batch(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    requests: Vec<TransclusionRequest>,
) -> Result<Vec<TransclusionResult>, String> {
    if requests.len() > BATCH_LIMIT {
        return Err(format!(
            "too many transclusion requests (maximum {BATCH_LIMIT})"
        ));
    }
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let entries = list_files(&root, true, FILE_LIST_LIMIT)?;
        let mut file_cache = HashMap::<String, (String, u64)>::new();
        let mut results = Vec::with_capacity(requests.len());

        for request in requests {
            let Some(resolved_path) = resolve_standard_wikilink_target(&entries, &request.target)
            else {
                results.push(TransclusionResult::error(
                    request.key,
                    None,
                    None,
                    TransclusionErrorKind::Unresolved,
                ));
                continue;
            };
            let source = if let Some(cached) = file_cache.get(&resolved_path) {
                cached.clone()
            } else {
                let absolute = paths::join_under(&root, Path::new(&resolved_path))?;
                let mtime_ms = file_mtime_ms(&absolute);
                match std::fs::read_to_string(&absolute) {
                    Ok(markdown) => {
                        file_cache.insert(resolved_path.clone(), (markdown.clone(), mtime_ms));
                        (markdown, mtime_ms)
                    }
                    Err(_) => {
                        results.push(TransclusionResult::error(
                            request.key,
                            Some(resolved_path),
                            Some(mtime_ms),
                            TransclusionErrorKind::ReadError,
                        ));
                        continue;
                    }
                }
            };
            let (markdown, error_kind) = match request.anchor_kind {
                TransclusionAnchorKind::None => (Some(source.0), None),
                TransclusionAnchorKind::Heading => (
                    request
                        .anchor
                        .as_deref()
                        .and_then(|anchor| extract_heading_section(&source.0, anchor)),
                    Some(TransclusionErrorKind::MissingHeading),
                ),
                TransclusionAnchorKind::Block => {
                    (None, Some(TransclusionErrorKind::UnsupportedBlock))
                }
            };
            let error_kind = error_kind.filter(|_| markdown.is_none());
            results.push(TransclusionResult {
                key: request.key,
                resolved_path: Some(resolved_path),
                markdown,
                mtime_ms: Some(source.1),
                error_kind,
            });
        }
        Ok(results)
    })
    .await
    .map_err(|error| error.to_string())?
}
