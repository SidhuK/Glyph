use std::collections::HashSet;
use std::path::Path;

use serde::Serialize;
use tauri::{Emitter, State, WebviewWindow};

use super::frontmatter::set_archived;
use crate::note_mutation::{commit_markdown, CommitCtx, PersistMode, SpaceChange, CHANGED_EVENT};
use crate::space_fs::helpers::{deny_hidden_rel_path, file_mtime_ms};
use crate::{index, paths, space::SpaceState, utils};

// The property index is derived from frontmatter; no schema migration is needed.
pub const ARCHIVED_NOTE_IDS: &str = "SELECT note_id FROM note_properties WHERE key = 'archived' AND value_type = 'checkbox' AND value_text = 'true'";
pub const ACTIVE_NOTES: &str = "n.id NOT IN (SELECT note_id FROM note_properties WHERE key = 'archived' AND value_type = 'checkbox' AND value_text = 'true')";
pub const ARCHIVED_NOTES: &str = "n.id IN (SELECT note_id FROM note_properties WHERE key = 'archived' AND value_type = 'checkbox' AND value_text = 'true')";

#[tauri::command]
pub async fn notes_archived_paths(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
) -> Result<Vec<String>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = index::open_db(&root)?;
        let mut stmt = conn
            .prepare(&format!("SELECT n.path FROM notes n WHERE {ARCHIVED_NOTES}"))
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<String>, _>>().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct ArchiveFailure {
    path: String,
    error: String,
}

#[derive(Serialize)]
pub struct ArchiveResult {
    changed_paths: Vec<String>,
    failures: Vec<ArchiveFailure>,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn notes_set_archived(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    paths: Vec<String>,
    archived: bool,
    expected_space: String,
) -> Result<ArchiveResult, String> {
    let root = state.root_for_window(&window)?;
    let space_path = root.to_string_lossy().to_string();
    if space_path != expected_space {
        return Err("Space changed before archiving notes".into());
    }
    let emit_space_path = space_path.clone();
    let recent = state.recent_local_changes_for_window(window.label());
    let mutex = state.note_mutation_mutex();
    let (result, changes) = tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        let _guard = mutex.lock().map_err(|_| "note mutation mutex poisoned".to_string())?;
        let mut result = ArchiveResult { changed_paths: Vec::new(), failures: Vec::new() };
        let mut changes = Vec::new();
        let mut seen = HashSet::new();
        for path in paths {
            if !seen.insert(path.clone()) {
                continue;
            }
            let update = (|| -> Result<(), String> {
                let rel = Path::new(&path);
                deny_hidden_rel_path(rel)?;
                if !utils::is_markdown_path(rel) {
                    return Err("Only Markdown notes can be archived".into());
                }
                let abs = paths::join_under(&root, rel)?;
                let mtime = file_mtime_ms(&abs);
                let text = std::fs::read_to_string(&abs).map_err(|e| e.to_string())?;
                let next = set_archived(&text, archived)?;
                if next == text { return Ok(()); }
                let committed = commit_markdown(
                    &CommitCtx { root: &root, recent: &recent, space_path: &space_path },
                    &path,
                    &next,
                    PersistMode::Replace { expected_mtime_ms: Some(mtime) },
                )?;
                changes.push(committed.change);
                result.changed_paths.push(path.clone());
                Ok(())
            })();
            if let Err(error) = update {
                result.failures.push(ArchiveFailure { path, error });
            }
        }
        Ok((result, changes))
    })
    .await
    .map_err(|e| e.to_string())??;
    if !changes.is_empty() {
        // Each window filters this typed event by space_path.
        let _ = app.emit(CHANGED_EVENT, SpaceChange::batch(emit_space_path, changes));
    }
    Ok(result)
}
