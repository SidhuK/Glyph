use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    ffi::OsStr,
    path::PathBuf,
};
use tauri::{Emitter, State, WebviewWindow};

use crate::space::state::mark_recent_local_change;
use crate::space_fs::helpers::{deny_hidden_rel_path, file_mtime_ms};
use crate::{index, io_atomic, paths, space::SpaceState};

use super::{
    markdown,
    types::{RolloverCandidate, RolloverMoveItem, RolloverMoveResult},
};

#[derive(Clone, Serialize)]
struct NoteChangeEvent {
    space_path: String,
    rel_path: String,
    removed: bool,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn daily_note_rollover_candidates(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    folder: String,
    before_date: String,
    source_date: Option<String>,
) -> Result<Vec<RolloverCandidate>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        if !markdown::valid_date(&before_date) {
            return Err("invalid rollover date".to_string());
        }
        let folder_rel = PathBuf::from(folder);
        deny_hidden_rel_path(&folder_rel)?;
        let folder_abs = paths::join_under(&root, &folder_rel)?;
        let mut candidates = Vec::new();
        let entries = match std::fs::read_dir(folder_abs) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(candidates),
            Err(error) => return Err(error.to_string()),
        };
        for entry in entries {
            let entry = entry.map_err(|error| error.to_string())?;
            if !entry
                .file_type()
                .map_err(|error| error.to_string())?
                .is_file()
            {
                continue;
            }
            let Some(filename) = entry.file_name().to_str().map(str::to_string) else {
                continue;
            };
            let Some(date) = filename.strip_suffix(".md") else {
                continue;
            };
            if !markdown::valid_date(date)
                || (source_date.is_none() && date >= before_date.as_str())
            {
                continue;
            }
            if source_date.as_deref().is_some_and(|only| only != date) {
                continue;
            }
            let rel = folder_rel.join(&filename);
            let abs = paths::join_under(&root, &rel)?;
            let text = std::fs::read_to_string(&abs).map_err(|error| error.to_string())?;
            candidates.extend(markdown::parse_candidates(
                &rel.to_string_lossy(),
                date,
                &text,
                file_mtime_ms(&abs),
            ));
        }
        candidates.sort_by(|a, b| {
            b.source_date
                .cmp(&a.source_date)
                .then(a.start.cmp(&b.start))
        });
        Ok(candidates)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn daily_note_rollover_move(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    folder: String,
    destination_path: String,
    destination_date: String,
    destination_initial_text: String,
    items: Vec<RolloverMoveItem>,
) -> Result<RolloverMoveResult, String> {
    if items.is_empty() || !markdown::valid_date(&destination_date) {
        return Err("select at least one rollover candidate".to_string());
    }
    let root = state.root_for_window(&window)?;
    let space_path = root.to_string_lossy().to_string();
    let window_label = window.label().to_string();
    let recent_changes = state.recent_local_changes_for_window(window.label());
    let result = tauri::async_runtime::spawn_blocking(move || {
        let folder_rel = PathBuf::from(folder);
        deny_hidden_rel_path(&folder_rel)?;
        let destination_rel = PathBuf::from(&destination_path);
        deny_hidden_rel_path(&destination_rel)?;
        if destination_rel.parent() != Some(folder_rel.as_path())
            || destination_rel.extension() != Some(OsStr::new("md"))
            || destination_rel.file_stem().and_then(|value| value.to_str())
                != Some(destination_date.as_str())
        {
            return Err("rollover destination must be a Markdown note".to_string());
        }

        let mut source_items = BTreeMap::<String, Vec<RolloverMoveItem>>::new();
        let mut selected_ids = BTreeSet::new();
        for item in items {
            if !selected_ids.insert((item.source_path.clone(), item.id.clone())) {
                return Err("a rollover candidate was selected more than once".to_string());
            }
            source_items
                .entry(item.source_path.clone())
                .or_default()
                .push(item);
        }
        if source_items.contains_key(&destination_path) {
            return Err("source and destination daily notes must differ".to_string());
        }

        let mut originals = BTreeMap::<String, Option<String>>::new();
        let mut rewritten = BTreeMap::<String, String>::new();
        let mut destination_groups = BTreeMap::<String, Vec<String>>::new();
        for (source_path, selected) in &mut source_items {
            let rel = PathBuf::from(source_path);
            deny_hidden_rel_path(&rel)?;
            if rel.parent() != Some(folder_rel.as_path())
                || rel.extension() != Some(OsStr::new("md"))
            {
                return Err("rollover source must be a configured daily note".to_string());
            }
            let source_date = rel
                .file_stem()
                .and_then(|value| value.to_str())
                .filter(|date| markdown::valid_date(date))
                .ok_or_else(|| "rollover source must be a configured daily note".to_string())?;
            let abs = paths::join_under(&root, &rel)?;
            let source = std::fs::read_to_string(&abs).map_err(|error| error.to_string())?;
            let actual_mtime = file_mtime_ms(&abs);
            if selected
                .iter()
                .any(|item| item.source_mtime_ms != actual_mtime)
            {
                return Err(format!(
                    "conflict: {source_path} changed since rollover review opened"
                ));
            }
            let parsed =
                markdown::parse_candidates(source_path, source_date, &source, actual_mtime);
            let by_id = parsed
                .into_iter()
                .map(|candidate| (candidate.id.clone(), candidate))
                .collect::<BTreeMap<_, _>>();
            let mut replacements = Vec::new();
            for item in selected.iter() {
                let candidate = by_id
                    .get(&item.id)
                    .filter(|candidate| candidate.start == item.start && candidate.end == item.end)
                    .ok_or_else(|| {
                        format!("conflict: a selected checkbox in {source_path} changed")
                    })?;
                replacements.push((
                    candidate.start,
                    candidate.end,
                    markdown::mark_moved(
                        &source[candidate.start..candidate.end],
                        &destination_date,
                    )?,
                ));
                destination_groups
                    .entry(candidate.original_date.clone())
                    .or_default()
                    .push(candidate.markdown.clone());
            }
            replacements.sort_by_key(|(start, _, _)| std::cmp::Reverse(*start));
            let mut next_source = source.clone();
            for (start, end, replacement) in replacements {
                next_source.replace_range(start..end, &replacement);
            }
            originals.insert(source_path.clone(), Some(source));
            rewritten.insert(source_path.clone(), next_source);
        }

        let destination_abs = paths::join_under(&root, &destination_rel)?;
        let destination_original = match std::fs::read_to_string(&destination_abs) {
            Ok(value) => Some(value),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(error.to_string()),
        };
        let group_values = destination_groups.into_iter().collect::<Vec<_>>();
        let destination_next = markdown::insert_overdue_blocks(
            destination_original
                .as_deref()
                .unwrap_or(&destination_initial_text),
            &group_values,
        );
        originals.insert(destination_path.clone(), destination_original);
        rewritten.insert(destination_path.clone(), destination_next);

        let mut committed = Vec::<String>::new();
        for (path, text) in &rewritten {
            let abs = paths::join_under(&root, &PathBuf::from(path))?;
            if let Err(error) = io_atomic::write_atomic(&abs, text.as_bytes()) {
                for committed_path in committed.iter().rev() {
                    let committed_abs = paths::join_under(&root, &PathBuf::from(committed_path))?;
                    match originals
                        .get(committed_path)
                        .and_then(|value| value.as_ref())
                    {
                        Some(original) => {
                            let _ = io_atomic::write_atomic(&committed_abs, original.as_bytes());
                        }
                        None => {
                            let _ = std::fs::remove_file(&committed_abs);
                        }
                    }
                }
                return Err(format!("failed to persist rollover: {error}"));
            }
            committed.push(path.clone());
        }

        for (path, text) in &rewritten {
            if let Err(error) = index::index_note(&root, path, text) {
                tracing::warn!(note_id = %path, %error, "rolled-over note could not be indexed");
            } else {
                mark_recent_local_change(&recent_changes, path);
            }
        }
        Ok(RolloverMoveResult {
            moved_count: source_items.values().map(Vec::len).sum::<usize>() as u32,
            destination_path,
            changed_paths: rewritten.into_keys().collect(),
        })
    })
    .await
    .map_err(|error| error.to_string())??;

    for rel_path in &result.changed_paths {
        let _ = app.emit_to(
            &window_label,
            "notes:external_changed",
            NoteChangeEvent {
                space_path: space_path.clone(),
                rel_path: rel_path.clone(),
                removed: false,
            },
        );
    }
    Ok(result)
}
