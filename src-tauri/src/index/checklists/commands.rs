use super::{metadata, parse::parse_checklist_items, store::query_tasks, types::InboxTask};
use crate::space_fs::helpers::{deny_hidden_rel_path, etag_for, file_mtime_ms};
use crate::{
    note_mutation::{commit_markdown, CommitCtx, PersistMode, CHANGED_EVENT},
    paths,
    space::SpaceState,
};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{Emitter, State, WebviewWindow};

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TaskAction {
    Check { start: usize, checked: bool },
    Schedule { start: usize, due: Option<String> },
    Restore { text: String },
}

#[derive(Serialize)]
pub struct TaskUpdateResult {
    pub note_path: String,
    pub etag: String,
    pub previous_text: String,
}

#[tauri::command]
pub async fn tasks_list(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
) -> Result<Vec<InboxTask>, String> {
    let root = state.root_for_window(&window)?;
    let mutex = state.note_mutation_mutex();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = mutex.lock().map_err(|_| "note mutation mutex poisoned")?;
        query_tasks(&root)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn task_update(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    space_path: String,
    note_path: String,
    etag: String,
    action: TaskAction,
) -> Result<TaskUpdateResult, String> {
    let root = state.root_for_window(&window)?;
    if root.to_string_lossy() != space_path {
        return Err("conflict: the active space changed".to_string());
    }
    let recent = state.recent_local_changes_for_window(window.label());
    let mutex = state.note_mutation_mutex();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = mutex.lock().map_err(|_| "note mutation mutex poisoned")?;
        let relative = Path::new(&note_path);
        deny_hidden_rel_path(relative)?;
        let absolute = paths::join_under(&root, relative)?;
        let mtime = file_mtime_ms(&absolute);
        let original = std::fs::read_to_string(&absolute).map_err(|error| error.to_string())?;
        if file_mtime_ms(&absolute) != mtime || etag_for(original.as_bytes()) != etag {
            return Err("conflict: note changed; refresh tasks and try again".to_string());
        }
        let next = rewrite_task(&original, action)?;
        let space_path = root.to_string_lossy().to_string();
        let committed = commit_markdown(
            &CommitCtx {
                root: &root,
                recent: &recent,
                space_path: &space_path,
            },
            &note_path,
            &next,
            PersistMode::Replace {
                expected_mtime_ms: Some(mtime),
            },
        )?;
        // Broadcast the typed event so every window showing this space updates.
        let _ = app.emit(CHANGED_EVENT, &committed.change);
        Ok(TaskUpdateResult {
            note_path,
            etag: committed.etag,
            previous_text: original,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

fn rewrite_task(original: &str, action: TaskAction) -> Result<String, String> {
    let start = match action {
        TaskAction::Restore { text } => return Ok(text),
        TaskAction::Check { start, .. } | TaskAction::Schedule { start, .. } => start,
    };
    let task = parse_checklist_items(original)
        .into_iter()
        .find(|task| task.start == start)
        .ok_or("conflict: task no longer exists")?;
    let mut next = original.to_string();
    match action {
        TaskAction::Schedule { due, .. } => {
            if due
                .as_deref()
                .is_some_and(|value| metadata::date(value).is_none())
            {
                return Err("invalid task date".to_string());
            }
            next.replace_range(
                task.content_offset..task.end,
                &format!(
                    "{}{}",
                    metadata::with_metadata(&task.text, due.as_deref()),
                    task.suffix
                ),
            );
        }
        TaskAction::Check { checked, .. } => next.replace_range(
            task.checkbox_offset..task.checkbox_offset + 1,
            if checked { "x" } else { " " },
        ),
        TaskAction::Restore { .. } => unreachable!("restore returned before parsing"),
    }
    Ok(next)
}
