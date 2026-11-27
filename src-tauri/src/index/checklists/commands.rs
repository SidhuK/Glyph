use std::path::{Path, PathBuf};

use tauri::{AppHandle, State, WebviewWindow};

use crate::index::open_db;
use crate::note_mutation::{emit_changed, CommitCtx, SpaceChange};
use crate::space::SpaceState;

use super::api::{
    TaskCreateRequest, TaskCreateResult, TaskNoteWriteResult, TaskQueryRequest, TaskRecord,
    TaskUpdateBatchRequest,
};
use super::disk::{create_on_disk, update_on_disk, Written};
use super::query::query_tasks;

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
pub async fn tasks_query(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    request: TaskQueryRequest,
) -> Result<Vec<TaskRecord>, String> {
    let root = root_for_space(&state, &window, &request.space_path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = open_db(&root)?;
        query_tasks(&conn, &request)
    })
    .await
    .map_err(|e| e.to_string())?
}

async fn write_tasks<T, F>(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    space_path: &str,
    write: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&CommitCtx<'_>) -> Result<Written<T>, String> + Send + 'static,
{
    let root = root_for_space(&state, &window, space_path)?;
    let space_path = root.to_string_lossy().into_owned();
    let window_label = window.label().to_string();
    let recent = state.recent_local_changes_for_window(&window_label);
    let note_mutation_mutex = state.note_mutation_mutex();
    let emitted_space = space_path.clone();
    let (result, mut changes) = tauri::async_runtime::spawn_blocking(move || {
        let _guard = note_mutation_mutex
            .lock()
            .map_err(|_| "note mutation mutex poisoned".to_string())?;
        let ctx = CommitCtx {
            root: &root,
            recent: &recent,
            space_path: &space_path,
        };
        write(&ctx)
    })
    .await
    .map_err(|e| e.to_string())??;
    let change = match changes.len() {
        0 => None,
        1 => changes.pop(),
        _ => Some(SpaceChange::batch(emitted_space, changes)),
    };
    if let Some(change) = change {
        emit_changed(&app, &window_label, &change);
    }
    Ok(result)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn tasks_update_batch(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    request: TaskUpdateBatchRequest,
) -> Result<Vec<TaskNoteWriteResult>, String> {
    let space_path = request.space_path.clone();
    write_tasks(app, window, state, &space_path, move |ctx| {
        update_on_disk(ctx, &request)
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn tasks_create(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    request: TaskCreateRequest,
) -> Result<TaskCreateResult, String> {
    let space_path = request.space_path.clone();
    write_tasks(app, window, state, &space_path, move |ctx| {
        create_on_disk(ctx, &request)
    })
    .await
}
