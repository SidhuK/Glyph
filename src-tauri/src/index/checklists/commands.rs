use std::path::{Path, PathBuf};

use tauri::{AppHandle, State, WebviewWindow};

use crate::index::open_db;
use crate::note_mutation::{commit_markdown, emit_changed, CommitCtx, PersistMode, SpaceChange};
use crate::{paths, utils};
use crate::space::SpaceState;
use crate::space_fs::helpers::{deny_hidden_rel_path, etag_for, file_mtime_ms};

use super::store::query_open_tasks;
use super::toggle::{toggle_checklist_item, NOTE_CHANGED};
use super::types::{TaskNoteGroup, TaskScope, TaskToggleOutcome, TaskToggleRequest};

fn root_for_space(
    state: &SpaceState,
    window: &WebviewWindow,
    space_path: &str,
) -> Result<PathBuf, String> {
    let root = state.root_for_window(window)?;
    if root != Path::new(space_path) {
        return Err("Space changed before updating the task".to_string());
    }
    Ok(root)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn tasks_list(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    space_path: String,
    scope: TaskScope,
) -> Result<Vec<TaskNoteGroup>, String> {
    let root = root_for_space(&state, &window, &space_path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = open_db(&root)?;
        query_open_tasks(&conn, &scope)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn tasks_toggle(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    request: TaskToggleRequest,
) -> Result<TaskToggleOutcome, String> {
    let root = root_for_space(&state, &window, &request.space_path)?;
    let space_path = root.to_string_lossy().into_owned();
    let window_label = window.label().to_string();
    let recent = state.recent_local_changes_for_window(&window_label);
    let note_mutation_mutex = state.note_mutation_mutex();
    let (outcome, change) = tauri::async_runtime::spawn_blocking(move || {
        let _guard = note_mutation_mutex
            .lock()
            .map_err(|_| "note mutation mutex poisoned".to_string())?;
        let ctx = CommitCtx {
            root: &root,
            recent: &recent,
            space_path: &space_path,
        };
        toggle_on_disk(&ctx, &request)
    })
    .await
    .map_err(|e| e.to_string())??;
    if let Some(change) = change {
        emit_changed(&app, &window_label, &change);
    }
    Ok(outcome)
}

/// Returns the outcome and, when the file was rewritten, its change event.
pub(super) fn toggle_on_disk(
    ctx: &CommitCtx<'_>,
    request: &TaskToggleRequest,
) -> Result<(TaskToggleOutcome, Option<SpaceChange>), String> {
    let rel = PathBuf::from(&request.note_path);
    deny_hidden_rel_path(&rel)?;
    if !utils::is_markdown_path(&rel) {
        return Err("note mutation requires a Markdown path".to_string());
    }
    let abs = paths::join_under(ctx.root, &rel)?;
    let mtime_ms = file_mtime_ms(&abs);
    let bytes = std::fs::read(&abs).map_err(|e| e.to_string())?;
    if etag_for(&bytes) != request.etag {
        return Err(NOTE_CHANGED.to_string());
    }
    let markdown = String::from_utf8(bytes).map_err(|e| e.to_string())?;
    let Some(next) = toggle_checklist_item(&markdown, request.start, request.checked)? else {
        let etag = request.etag.clone();
        return Ok((TaskToggleOutcome::Saved { etag }, None));
    };
    let committed = commit_markdown(
        ctx,
        &request.note_path,
        &next,
        PersistMode::Replace {
            expected_mtime_ms: Some(mtime_ms),
        },
    )
    .map_err(|error| {
        if error.starts_with("conflict:") {
            NOTE_CHANGED.to_string()
        } else {
            error
        }
    })?;
    let etag = committed.etag;
    let outcome = if committed.index_failed {
        TaskToggleOutcome::IndexFailed { etag }
    } else {
        TaskToggleOutcome::Saved { etag }
    };
    Ok((outcome, Some(committed.change)))
}
