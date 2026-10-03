use std::path::Path;
use tauri::{State, WebviewWindow};

use super::{
    markdown,
    types::{InboxTask, TaskUpdateRequest, TaskWriteOutcome},
};
use crate::index::checklists::parse_checklist_items;
use crate::note_mutation::{emit_changed, SpaceChange};
use crate::space::state::mark_recent_local_change;
use crate::space_fs::helpers::{deny_hidden_rel_path, etag_for};
use crate::{index, io_atomic, paths, space::SpaceState, utils};

#[tauri::command(rename_all = "snake_case")]
pub async fn task_inbox_list(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    space_path: String,
) -> Result<Vec<InboxTask>, String> {
    let root = state.root_for_window(&window)?;
    if root.as_path() != Path::new(&space_path) {
        return Err("conflict: the active space changed".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let conn = index::open_db(&root)?;
        let mut statement = conn
            .prepare("SELECT path FROM notes WHERE checklist_total > 0 ORDER BY path")
            .map_err(|error| error.to_string())?;
        let paths = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        let mut tasks = Vec::new();
        for path in paths {
            let path = path.map_err(|error| error.to_string())?;
            let rel = Path::new(&path);
            deny_hidden_rel_path(rel)?;
            let absolute = paths::join_under(&root, rel)?;
            let source = match std::fs::read_to_string(absolute) {
                Ok(source) => source,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error.to_string()),
            };
            let etag = etag_for(source.as_bytes());
            let mut moved_until = 0;
            for item in parse_checklist_items(&source) {
                if item.start < moved_until {
                    continue;
                }
                if markdown::moved(item.text) {
                    moved_until =
                        markdown::block_end(&source, item.end, item.checkbox - item.start - 3);
                    continue;
                }
                let (text, schedule) = markdown::metadata(item.text);
                tasks.push(InboxTask {
                    note_path: path.clone(),
                    etag: etag.clone(),
                    start: item.start,
                    line: item.line,
                    text,
                    checked: item.checked,
                    schedule,
                });
            }
        }
        Ok(tasks)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn task_inbox_update(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    request: TaskUpdateRequest,
) -> Result<TaskWriteOutcome, String> {
    let root = state.root_for_window(&window)?;
    if root.as_path() != Path::new(&request.space_path) {
        return Err("conflict: the active space changed".into());
    }
    let label = window.label().to_string();
    let recent = state.recent_local_changes_for_window(window.label());
    let mutex = state.note_mutation_mutex();
    let (change, outcome) = tauri::async_runtime::spawn_blocking(move || {
        let _guard = mutex.lock().map_err(|_| "note mutation mutex poisoned")?;
        let rel = Path::new(&request.note_path);
        deny_hidden_rel_path(rel)?;
        if !utils::is_markdown_path(rel) {
            return Err("tasks must belong to a Markdown note".to_string());
        }
        let absolute = paths::join_under(&root, rel)?;
        let source = std::fs::read_to_string(&absolute).map_err(|error| error.to_string())?;
        if request.editor_markdown.as_ref().is_some_and(|buffer| buffer != &source) {
            return Err("task_inbox:unsaved".into());
        }
        if etag_for(source.as_bytes()) != request.etag {
            return Err("conflict: note changed; refresh the inbox".into());
        }
        let next = markdown::rewrite(&source, request.start, request.edit)?;
        if std::fs::read_to_string(&absolute).map_err(|error| error.to_string())? != source {
            return Err("conflict: note changed while saving".into());
        }
        io_atomic::write_atomic(&absolute, next.as_bytes()).map_err(|error| error.to_string())?;
        let outcome = match index::index_note(&root, &request.note_path, &next) {
            Ok(()) => {
                mark_recent_local_change(&recent, &request.note_path);
                TaskWriteOutcome::Saved
            }
            Err(error) => {
                // Leave the watcher eligible to retry indexing this write.
                tracing::error!(note_id = %request.note_path, %error, "saved task could not be indexed");
                TaskWriteOutcome::IndexFailed
            }
        };
        Ok((SpaceChange::content(request.space_path, request.note_path), outcome))
    })
    .await
    .map_err(|error| error.to_string())??;
    // The file changed even if indexing failed, so open editors must reload it.
    emit_changed(&app, &label, &change);
    Ok(outcome)
}
