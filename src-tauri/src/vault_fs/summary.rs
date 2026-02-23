use std::{cmp::Reverse, collections::BinaryHeap, ffi::OsStr, path::PathBuf};
use tauri::State;

use crate::{paths, vault::VaultState};

use super::helpers::{deny_hidden_rel_path, file_mtime_ms, should_hide};
use super::types::{DirChildSummary, RecentEntry, RecentMarkdown};

#[tauri::command(rename_all = "snake_case")]
pub async fn vault_dir_children_summary(
    state: State<'_, VaultState>,
    dir: Option<String>,
    preview_limit: Option<u32>,
) -> Result<Vec<DirChildSummary>, String> {
    const MAX_PREVIEW_LIMIT: usize = 20;
    const MAX_SCAN_FILES: usize = 200_000;

    let root = state.current_root()?;
    let dir = dir.unwrap_or_default();
    let limit = preview_limit
        .unwrap_or(5)
        .max(1)
        .min(MAX_PREVIEW_LIMIT as u32) as usize;

    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<DirChildSummary>, String> {
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

        let mut out: Vec<DirChildSummary> = Vec::new();

        let entries = std::fs::read_dir(&start_abs).map_err(|e| e.to_string())?;
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
            if !meta.is_dir() {
                continue;
            }

            let child_rel = start_rel.join(&name);
            deny_hidden_rel_path(&child_rel)?;

            let mut total_files: u32 = 0;
            let mut total_markdown: u32 = 0;
            let mut truncated = false;
            let mut scanned_files: usize = 0;

            let mut heap: BinaryHeap<Reverse<(u64, String, String)>> = BinaryHeap::new();

            let mut stack: Vec<PathBuf> = vec![child_rel.clone()];
            while let Some(rel_dir) = stack.pop() {
                let abs_dir = match paths::join_under(&root, &rel_dir) {
                    Ok(p) => p,
                    Err(_) => continue,
                };
                let dir_entries = match std::fs::read_dir(&abs_dir) {
                    Ok(e) => e,
                    Err(_) => continue,
                };

                for e in dir_entries {
                    let e = match e {
                        Ok(x) => x,
                        Err(_) => continue,
                    };
                    let child_name = e.file_name().to_string_lossy().to_string();
                    if should_hide(&child_name) {
                        continue;
                    }
                    let m = match e.metadata() {
                        Ok(m) => m,
                        Err(_) => continue,
                    };
                    let child_rel2 = rel_dir.join(&child_name);

                    if m.is_dir() {
                        stack.push(child_rel2);
                        continue;
                    }
                    if !m.is_file() {
                        continue;
                    }

                    total_files = total_files.saturating_add(1);
                    scanned_files += 1;
                    if scanned_files >= MAX_SCAN_FILES {
                        truncated = true;
                        break;
                    }

                    if child_rel2.extension() == Some(OsStr::new("md")) {
                        total_markdown = total_markdown.saturating_add(1);
                        let abs_file = match paths::join_under(&root, &child_rel2) {
                            Ok(p) => p,
                            Err(_) => continue,
                        };
                        let mtime = file_mtime_ms(&abs_file);
                        let rel_s = child_rel2.to_string_lossy().to_string();
                        let item = (mtime, rel_s, child_name);
                        if heap.len() < limit {
                            heap.push(Reverse(item));
                        } else if let Some(Reverse((min_mtime, _, _))) = heap.peek() {
                            if mtime > *min_mtime {
                                let _ = heap.pop();
                                heap.push(Reverse(item));
                            }
                        }
                    }
                }

                if truncated {
                    break;
                }
            }

            let mut recent: Vec<RecentMarkdown> = heap
                .into_iter()
                .map(|Reverse((mtime_ms, rel_path, file_name))| RecentMarkdown {
                    rel_path,
                    name: file_name,
                    mtime_ms,
                })
                .collect();
            recent.sort_by(|a, b| {
                b.mtime_ms
                    .cmp(&a.mtime_ms)
                    .then_with(|| a.rel_path.to_lowercase().cmp(&b.rel_path.to_lowercase()))
            });

            out.push(DirChildSummary {
                dir_rel_path: child_rel.to_string_lossy().to_string(),
                name,
                total_files_recursive: total_files,
                total_markdown_recursive: total_markdown,
                recent_markdown: recent,
                truncated,
            });
        }

        out.sort_by_cached_key(|e| e.name.to_lowercase());
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn vault_dir_recent_entries(
    state: State<'_, VaultState>,
    dir: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<RecentEntry>, String> {
    const MAX_LIMIT: usize = 50;

    let root = state.current_root()?;
    let dir = dir.unwrap_or_default();
    let limit = limit.unwrap_or(5).max(1).min(MAX_LIMIT as u32) as usize;

    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<RecentEntry>, String> {
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

        let mut heap: BinaryHeap<Reverse<(u64, String, String, bool)>> = BinaryHeap::new();

        for entry in std::fs::read_dir(&start_abs).map_err(|e| e.to_string())? {
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
            if !meta.is_file() {
                continue;
            }

            let child_rel = start_rel.join(&name);
            deny_hidden_rel_path(&child_rel)?;
            let mtime_ms = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let is_markdown = child_rel.extension() == Some(OsStr::new("md"));

            heap.push(Reverse((
                mtime_ms,
                child_rel.to_string_lossy().to_string(),
                name,
                is_markdown,
            )));
            if heap.len() > limit {
                heap.pop();
            }
        }

        let mut out: Vec<RecentEntry> = heap
            .into_iter()
            .map(
                |Reverse((mtime_ms, rel_path, name, is_markdown))| RecentEntry {
                    rel_path,
                    name,
                    is_markdown,
                    mtime_ms,
                },
            )
            .collect();

        out.sort_by(|a, b| b.mtime_ms.cmp(&a.mtime_ms));
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}
