use std::path::{Path, PathBuf};
use tauri::State;

use crate::{paths, space::SpaceState, utils};

use super::helpers::{deny_hidden_rel_path, should_hide};
use super::types::{FsEntry, FsEntryList};

fn metadata_timestamps(metadata: &std::fs::Metadata) -> (Option<String>, Option<String>) {
    let created = metadata
        .created()
        .ok()
        .and_then(utils::system_time_to_rfc3339);
    let updated = metadata
        .modified()
        .ok()
        .and_then(utils::system_time_to_rfc3339);
    (created, updated)
}

#[tauri::command]
pub async fn space_list_markdown_files(
    state: State<'_, SpaceState>,
    dir: Option<String>,
    recursive: Option<bool>,
    limit: Option<u32>,
) -> Result<Vec<FsEntry>, String> {
    let root = state.current_root()?;
    let dir = dir.unwrap_or_default();
    let recursive = recursive.unwrap_or(true);
    let limit = limit.unwrap_or(2_000).min(50_000) as usize;

    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<FsEntry>, String> {
        let start_rel = if dir.trim().is_empty() {
            PathBuf::new()
        } else {
            PathBuf::from(&dir)
        };
        deny_hidden_rel_path(&start_rel)?;
        let start_abs = paths::join_under(&root, &start_rel)?;
        if !start_abs.exists() {
            return Ok(Vec::new());
        }

        let mut out: Vec<FsEntry> = Vec::new();
        if !recursive {
            for entry in std::fs::read_dir(&start_abs).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let name = entry.file_name().to_string_lossy().to_string();
                if should_hide(&name) {
                    continue;
                }
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                if !utils::is_markdown_path(&path) {
                    continue;
                }
                let rel_path = start_rel.join(&name);
                let (created, updated) = entry
                    .metadata()
                    .ok()
                    .map(|metadata| metadata_timestamps(&metadata))
                    .unwrap_or((None, None));
                out.push(FsEntry {
                    name,
                    rel_path: rel_path.to_string_lossy().to_string(),
                    kind: "file".to_string(),
                    is_markdown: true,
                    created,
                    updated,
                });
                if out.len() >= limit {
                    break;
                }
            }
        } else {
            let mut stack: Vec<PathBuf> = vec![start_rel];
            while let Some(rel_dir) = stack.pop() {
                let abs_dir = paths::join_under(&root, &rel_dir)?;
                let entries = match std::fs::read_dir(&abs_dir) {
                    Ok(e) => e,
                    Err(_) => continue,
                };
                for entry in entries {
                    let entry = match entry {
                        Ok(e) => e,
                        Err(_) => continue,
                    };
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
                    if !utils::is_markdown_path(Path::new(&name)) {
                        continue;
                    }
                    let (created, updated) = metadata_timestamps(&meta);
                    out.push(FsEntry {
                        name,
                        rel_path: child_rel.to_string_lossy().to_string(),
                        kind: "file".to_string(),
                        is_markdown: true,
                        created,
                        updated,
                    });
                    if out.len() >= limit {
                        break;
                    }
                }
                if out.len() >= limit {
                    break;
                }
            }
        }

        out.sort_by_cached_key(|e| e.rel_path.to_lowercase());
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn space_list_non_markdown_files(
    state: State<'_, SpaceState>,
    dir: Option<String>,
    limit: Option<u32>,
) -> Result<FsEntryList, String> {
    let root = state.current_root()?;
    let dir = dir.unwrap_or_default();
    let limit = limit.unwrap_or(5_000).min(50_000) as usize;

    tauri::async_runtime::spawn_blocking(move || -> Result<FsEntryList, String> {
        let start_rel = if dir.trim().is_empty() {
            PathBuf::new()
        } else {
            PathBuf::from(&dir)
        };
        deny_hidden_rel_path(&start_rel)?;
        let start_abs = paths::join_under(&root, &start_rel)?;
        if !start_abs.exists() {
            return Ok(FsEntryList {
                files: Vec::new(),
                truncated: false,
            });
        }

        let mut out: Vec<FsEntry> = Vec::new();
        let mut stack: Vec<PathBuf> = vec![start_rel];
        while let Some(rel_dir) = stack.pop() {
            let abs_dir = paths::join_under(&root, &rel_dir)?;
            let entries = match std::fs::read_dir(&abs_dir) {
                Ok(e) => e,
                Err(_) => continue,
            };
            for entry in entries {
                let entry = match entry {
                    Ok(e) => e,
                    Err(_) => continue,
                };
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
                if !meta.is_file() || utils::is_markdown_path(&child_rel) {
                    continue;
                }
                let (created, updated) = metadata_timestamps(&meta);
                out.push(FsEntry {
                    name,
                    rel_path: child_rel.to_string_lossy().to_string(),
                    kind: "file".to_string(),
                    is_markdown: false,
                    created,
                    updated,
                });
                if out.len() >= limit {
                    out.sort_by_cached_key(|e| e.rel_path.to_lowercase());
                    return Ok(FsEntryList {
                        files: out,
                        truncated: true,
                    });
                }
            }
        }

        out.sort_by_cached_key(|e| e.rel_path.to_lowercase());
        Ok(FsEntryList {
            files: out,
            truncated: false,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn space_list_dir(
    state: State<'_, SpaceState>,
    dir: Option<String>,
) -> Result<Vec<FsEntry>, String> {
    let root = state.current_root()?;
    let dir = dir.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<FsEntry>, String> {
        let rel = if dir.trim().is_empty() {
            PathBuf::new()
        } else {
            PathBuf::from(&dir)
        };
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        let mut entries: Vec<FsEntry> = Vec::new();
        for entry in std::fs::read_dir(&abs).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name_os = entry.file_name();
            let name = name_os.to_string_lossy().to_string();
            if should_hide(&name) {
                continue;
            }
            let meta = entry.metadata().map_err(|e| e.to_string())?;
            let kind = if meta.is_dir() {
                "dir"
            } else if meta.is_file() {
                "file"
            } else {
                continue;
            };
            let rel_path = rel.join(&name);
            let is_markdown = utils::is_markdown_path(&rel_path);
            let (created, updated) = metadata_timestamps(&meta);
            entries.push(FsEntry {
                name,
                rel_path: rel_path.to_string_lossy().to_string(),
                kind: kind.to_string(),
                is_markdown,
                created,
                updated,
            });
        }

        entries
            .sort_by_cached_key(|e| (if e.kind == "dir" { 0u8 } else { 1 }, e.name.to_lowercase()));

        Ok(entries)
    })
    .await
    .map_err(|e| e.to_string())?
}
