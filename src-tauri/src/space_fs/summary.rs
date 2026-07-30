use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::{Path, PathBuf},
};
use tauri::{State, WebviewWindow};

use crate::{paths, space::SpaceState, utils};

use super::helpers::{deny_hidden_rel_path, should_hide};
use super::types::DirChildSummary;

const MAX_SCAN_ENTRIES: usize = 200_000;
const MAX_SUMMARY_PARENTS: usize = 5_000;

struct SummaryAccumulator {
    summary: DirChildSummary,
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
        }
    }

    fn record_file(&mut self, rel_path: &Path) {
        self.summary.total_files_recursive = self.summary.total_files_recursive.saturating_add(1);
        if utils::is_markdown_path(rel_path) {
            self.summary.total_markdown_recursive =
                self.summary.total_markdown_recursive.saturating_add(1);
        }
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
        let mut queue = VecDeque::from(traversal_roots);
        let mut scanned_entries = 0;
        let mut truncated = false;
        'traversal: while let Some(rel_dir) = queue.pop_front() {
            let abs_dir = match paths::join_under(&root, &rel_dir) {
                Ok(path) => path,
                Err(_) => continue,
            };
            let entries = match std::fs::read_dir(abs_dir) {
                Ok(entries) => entries,
                Err(_) => continue,
            };
            for entry in entries {
                if scanned_entries >= MAX_SCAN_ENTRIES {
                    truncated = true;
                    break 'traversal;
                }
                scanned_entries += 1;
                let entry = match entry {
                    Ok(entry) => entry,
                    Err(_) => continue,
                };
                let name = entry.file_name().to_string_lossy().to_string();
                if should_hide(&name) {
                    continue;
                }
                let Ok(file_type) = entry.file_type() else {
                    continue;
                };
                if file_type.is_symlink() {
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
                    queue.push_back(child_rel);
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
        if truncated {
            for accumulator in summaries.values_mut() {
                accumulator.summary.truncated = true;
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
