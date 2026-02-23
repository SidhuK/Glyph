use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::State;

use crate::{paths, utils, vault::VaultState};

const DEFAULT_FILE_LIST_LIMIT: usize = 20_000;
const DEFAULT_CHAR_BUDGET: usize = 12_000;
const MAX_CHAR_BUDGET: usize = 250_000;
const TRUNC_SUFFIX: &str = "\n…(truncated)";

#[derive(Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct AiContextAttachment {
    pub kind: String,
    pub path: String,
    pub label: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AiContextBuildRequest {
    pub attachments: Vec<AiContextAttachment>,
    pub char_budget: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct AiContextIndexItem {
    pub path: String,
    pub label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct AiContextIndexResponse {
    pub folders: Vec<AiContextIndexItem>,
    pub files: Vec<AiContextIndexItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct AiContextManifestItem {
    pub kind: String,
    pub label: String,
    pub chars: usize,
    pub est_tokens: usize,
    pub truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct AiContextManifest {
    pub items: Vec<AiContextManifestItem>,
    pub total_chars: usize,
    pub est_tokens: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct AiContextBuildResponse {
    pub payload: String,
    pub manifest: AiContextManifest,
    pub resolved_paths: Vec<String>,
}

fn normalize_rel(raw: &str) -> Option<String> {
    let mut parts: Vec<&str> = Vec::new();
    let normalized = raw.trim().replace('\\', "/");
    for part in normalized.split('/') {
        let p = part.trim();
        if p.is_empty() || p == "." {
            continue;
        }
        if p == ".." {
            return None;
        }
        parts.push(p);
    }
    Some(parts.join("/"))
}

fn should_hide(name: &str) -> bool {
    name.starts_with('.') || name.eq_ignore_ascii_case("node_modules")
}

fn estimate_tokens(chars: usize) -> usize {
    chars.div_ceil(4)
}

fn push_manifest_item(
    kind: &str,
    label: String,
    raw: String,
    remaining: &mut usize,
    parts: &mut Vec<String>,
    items: &mut Vec<AiContextManifestItem>,
) {
    if *remaining == 0 || raw.trim().is_empty() {
        return;
    }
    let mut clipped = raw.trim().to_string();
    let mut truncated = false;
    if clipped.len() > *remaining {
        let keep = remaining.saturating_sub(TRUNC_SUFFIX.len());
        clipped = format!("{}{}", &clipped[..keep], TRUNC_SUFFIX);
        truncated = true;
    }
    let chars = clipped.len();
    if chars == 0 {
        return;
    }
    *remaining = remaining.saturating_sub(chars);
    parts.push(clipped);
    items.push(AiContextManifestItem {
        kind: kind.to_string(),
        label,
        chars,
        est_tokens: estimate_tokens(chars),
        truncated,
    });
}

fn list_files(root: &Path, dir: &str, limit: usize) -> Result<Vec<String>, String> {
    let start = if dir.is_empty() {
        PathBuf::new()
    } else {
        PathBuf::from(dir)
    };
    let mut out: Vec<String> = Vec::new();
    let mut stack = vec![start];

    while let Some(rel_dir) = stack.pop() {
        let abs = paths::join_under(root, &rel_dir)?;
        let entries = match std::fs::read_dir(abs) {
            Ok(it) => it,
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
            out.push(utils::to_slash(&child_rel));
            if out.len() >= limit {
                break;
            }
        }
        if out.len() >= limit {
            break;
        }
    }

    out.sort_by_key(|p| p.to_lowercase());
    Ok(out)
}

#[tauri::command]
pub async fn ai_context_index(
    state: State<'_, VaultState>,
) -> Result<AiContextIndexResponse, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || {
        let files = list_files(&root, "", DEFAULT_FILE_LIST_LIMIT)?;
        let mut dirs = std::collections::BTreeSet::<String>::new();
        dirs.insert(String::new());
        for rel in &files {
            let mut parts = rel.split('/').collect::<Vec<_>>();
            let _ = parts.pop();
            let mut acc = String::new();
            for p in parts {
                acc = if acc.is_empty() {
                    p.to_string()
                } else {
                    format!("{acc}/{p}")
                };
                dirs.insert(acc.clone());
            }
        }

        Ok(AiContextIndexResponse {
            folders: dirs
                .into_iter()
                .map(|path| AiContextIndexItem {
                    label: if path.is_empty() {
                        "Vault".to_string()
                    } else {
                        path.clone()
                    },
                    path,
                })
                .collect(),
            files: files
                .into_iter()
                .map(|path| AiContextIndexItem {
                    label: path.clone(),
                    path,
                })
                .collect(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ai_context_build(
    state: State<'_, VaultState>,
    request: AiContextBuildRequest,
) -> Result<AiContextBuildResponse, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut remaining = request
            .char_budget
            .map(|v| v as usize)
            .unwrap_or(DEFAULT_CHAR_BUDGET)
            .clamp(200, MAX_CHAR_BUDGET);
        let mut parts: Vec<String> = Vec::new();
        let mut items: Vec<AiContextManifestItem> = Vec::new();
        let mut resolved_paths: Vec<String> = Vec::new();
        let mut seen = std::collections::BTreeSet::<String>::new();

        for attachment in request.attachments {
            if remaining == 0 {
                break;
            }
            let Some(path) = normalize_rel(&attachment.path) else {
                continue;
            };
            if attachment.kind == "folder" {
                let label = attachment
                    .label
                    .filter(|v| !v.trim().is_empty())
                    .unwrap_or_else(|| {
                        if path.is_empty() {
                            "Vault".to_string()
                        } else {
                            path.clone()
                        }
                    });
                push_manifest_item(
                    "folder",
                    label.clone(),
                    format!("# Folder: {label}"),
                    &mut remaining,
                    &mut parts,
                    &mut items,
                );
                let files = list_files(&root, &path, DEFAULT_FILE_LIST_LIMIT)?;
                for rel in files {
                    if remaining == 0 || seen.contains(&rel) {
                        continue;
                    }
                    let abs = paths::join_under(&root, &PathBuf::from(&rel))?;
                    let text = match std::fs::read_to_string(&abs) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    seen.insert(rel.clone());
                    resolved_paths.push(rel.clone());
                    push_manifest_item(
                        "file",
                        rel.clone(),
                        format!("# File: {rel}\n\n{text}"),
                        &mut remaining,
                        &mut parts,
                        &mut items,
                    );
                }
                continue;
            }

            if path.is_empty() || seen.contains(&path) {
                continue;
            }
            let abs = paths::join_under(&root, &PathBuf::from(&path))?;
            if let Ok(text) = std::fs::read_to_string(&abs) {
                seen.insert(path.clone());
                resolved_paths.push(path.clone());
                push_manifest_item(
                    "file",
                    path.clone(),
                    format!("# File: {path}\n\n{text}"),
                    &mut remaining,
                    &mut parts,
                    &mut items,
                );
            }
        }

        let payload = parts.join("\n\n---\n\n");
        Ok(AiContextBuildResponse {
            resolved_paths,
            manifest: AiContextManifest {
                total_chars: payload.len(),
                est_tokens: estimate_tokens(payload.len()),
                items,
            },
            payload,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ai_context_resolve_paths(
    state: State<'_, VaultState>,
    attachments: Vec<AiContextAttachment>,
) -> Result<Vec<String>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut out: Vec<String> = Vec::new();
        let mut seen = std::collections::BTreeSet::<String>::new();
        for attachment in attachments {
            let Some(path) = normalize_rel(&attachment.path) else {
                continue;
            };
            if attachment.kind == "folder" {
                for rel in list_files(&root, &path, DEFAULT_FILE_LIST_LIMIT)? {
                    if seen.insert(rel.clone()) {
                        out.push(rel);
                    }
                }
            } else if !path.is_empty() && seen.insert(path.clone()) {
                out.push(path);
            }
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}
