use std::{
    collections::{HashMap, HashSet},
    ffi::OsStr,
    path::{Path, PathBuf},
};
use tauri::{State, WebviewWindow};

use crate::{paths, space::SpaceState};

use super::helpers::{deny_hidden_rel_path, should_hide};
use super::types::DirChildSummary;

const MAX_SCAN_FILES: usize = 200_000;
const MAX_SUMMARY_PARENTS: usize = 5_000;

struct SummaryAccumulator {
    summary: DirChildSummary,
    scanned_files: usize,
}

impl SummaryAccumulator {
    fn new(dir_rel_path: &Path, name: String) -> Self {
        Self {
            summary: DirChildSummary {
                dir_rel_path: dir_rel_path.to_string_lossy().to_string(),
                name,
                total_files_recursive: 0,
                total_markdown_recursive: 0,
                truncated: false,
            },
            scanned_files: 0,
        }
    }

    fn record_file(&mut self, rel_path: &Path) {
        if self.summary.truncated {
            return;
        }

        self.summary.total_files_recursive = self.summary.total_files_recursive.saturating_add(1);
        self.scanned_files += 1;
        if self.scanned_files >= MAX_SCAN_FILES {
            self.summary.truncated = true;
            return;
        }
        if rel_path.extension() != Some(OsStr::new("md")) {
            return;
        }

        self.summary.total_markdown_recursive =
            self.summary.total_markdown_recursive.saturating_add(1);
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_dir_children_summary(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    dirs: Vec<String>,
) -> Result<Vec<DirChildSummary>, String> {
    let root = state.root_for_window(&window)?;

    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<DirChildSummary>, String> {
        if dirs.len() > MAX_SUMMARY_PARENTS {
            return Err(format!(
                "Too many folder summary parents (maximum {MAX_SUMMARY_PARENTS})"
            ));
        }

        let mut requested_parents = HashSet::new();
        for dir in dirs {
            let rel = if dir.trim().is_empty() {
                PathBuf::new()
            } else {
                PathBuf::from(dir)
            };
            deny_hidden_rel_path(&rel)?;
            requested_parents.insert(rel);
        }

        let traversal_roots: Vec<PathBuf> = requested_parents
            .iter()
            .filter(|path| {
                !path
                    .ancestors()
                    .skip(1)
                    .any(|ancestor| requested_parents.contains(ancestor))
            })
            .cloned()
            .collect();
        let mut summaries = HashMap::new();
        let mut stack = traversal_roots;
        while let Some(rel_dir) = stack.pop() {
            let abs_dir = match paths::join_under(&root, &rel_dir) {
                Ok(path) => path,
                Err(_) => continue,
            };
            let entries = match std::fs::read_dir(abs_dir) {
                Ok(entries) => entries,
                Err(_) => continue,
            };
            for entry in entries {
                let entry = match entry {
                    Ok(entry) => entry,
                    Err(_) => continue,
                };
                let name = entry.file_name().to_string_lossy().to_string();
                if should_hide(&name) {
                    continue;
                }
                let metadata = match entry.metadata() {
                    Ok(metadata) => metadata,
                    Err(_) => continue,
                };
                let child_rel = rel_dir.join(&name);
                if metadata.is_dir() {
                    if requested_parents.contains(&rel_dir) {
                        summaries
                            .entry(child_rel.clone())
                            .or_insert_with(|| SummaryAccumulator::new(&child_rel, name));
                    }
                    stack.push(child_rel);
                    continue;
                }
                if !metadata.is_file() {
                    continue;
                }

                let mut ancestor = child_rel.parent();
                while let Some(dir) = ancestor {
                    if let Some(summary) = summaries.get_mut(dir) {
                        summary.record_file(&child_rel);
                    }
                    ancestor = dir.parent();
                }
            }
        }

        let mut out: Vec<DirChildSummary> = summaries
            .into_values()
            .map(|accumulator| accumulator.summary)
            .collect();
        out.sort_by_cached_key(|summary| summary.dir_rel_path.to_lowercase());
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}
