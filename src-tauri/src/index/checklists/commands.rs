use super::{
    metadata::{self, TaskRepeat},
    parse::parse_checklist_items,
    store::query_tasks,
    types::InboxTask,
};
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
    Check {
        start: usize,
        checked: bool,
    },
    Schedule {
        start: usize,
        due: Option<String>,
        repeat: Option<TaskRepeat>,
    },
    Restore {
        text: String,
    },
}

#[derive(Serialize)]
pub struct TaskUpdateResult {
    pub note_path: String,
    pub etag: String,
    pub previous_text: String,
    pub next_due: Option<String>,
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
        let original = std::fs::read_to_string(&absolute).map_err(|error| error.to_string())?;
        if etag_for(original.as_bytes()) != etag {
            return Err("conflict: note changed; refresh tasks and try again".to_string());
        }
        let mtime = file_mtime_ms(&absolute);
        let (next, next_due) = rewrite_task(&original, action)?;
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
            next_due,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(super) fn rewrite_task(
    original: &str,
    action: TaskAction,
) -> Result<(String, Option<String>), String> {
    let (start, schedule, checked) = match action {
        TaskAction::Restore { text } => return Ok((text, None)),
        TaskAction::Check { start, checked } => (start, None, Some(checked)),
        TaskAction::Schedule { start, due, repeat } => {
            if due
                .as_deref()
                .is_some_and(|value| metadata::date(value).is_none())
            {
                return Err("invalid task date".to_string());
            }
            if repeat.is_some() && due.is_none() {
                return Err("repeating tasks need a due date".to_string());
            }
            (start, Some((due, repeat)), None)
        }
    };
    let task = parse_checklist_items(original)
        .into_iter()
        .find(|task| task.start == start)
        .ok_or("conflict: task no longer exists")?;
    let mut next = original.to_string();
    if let Some((due, repeat)) = schedule {
        next.replace_range(
            task.content_offset..task.end,
            &format!(
                "{}{}",
                metadata::with_metadata(&task.text, due.as_deref(), repeat),
                task.suffix
            ),
        );
        return Ok((next, None));
    }
    let checked = checked.ok_or("missing task action")?;
    if checked == task.checked && !(checked && task.repeat.is_some()) {
        return Ok((next, None));
    }
    next.replace_range(
        task.checkbox_offset..task.checkbox_offset + 1,
        if checked { "x" } else { " " },
    );
    if checked {
        if let Some(repeat) = task.repeat {
            let due = task
                .due
                .as_deref()
                .and_then(metadata::date)
                .ok_or("repeating tasks need a due date")?;
            let today = chrono::Local::now().date_naive();
            let mut next_date = repeat.next(due).ok_or("task date is out of range")?;
            while next_date <= today {
                next_date = repeat.next(next_date).ok_or("task date is out of range")?;
            }
            let next_due = next_date.format("%Y-%m-%d").to_string();
            // Insert the next occurrence before this one. Existing nested content stays with the completed occurrence.
            let mut prefix = original[task.start..task.content_offset].to_string();
            let status = task.checkbox_offset - task.start;
            prefix.replace_range(status..status + 1, " ");
            let newline = if original.contains("\r\n") {
                "\r\n"
            } else {
                "\n"
            };
            let pending = format!(
                "{prefix}{}{newline}",
                metadata::with_metadata(&task.text, Some(&next_due), Some(repeat))
            );
            next.replace_range(
                task.content_offset..task.end,
                &format!(
                    "{}{}",
                    metadata::with_metadata(&task.text, task.due.as_deref(), None),
                    task.suffix
                ),
            );
            next.insert_str(task.start, &pending);
            return Ok((next, Some(next_due)));
        }
    }
    Ok((next, None))
}
