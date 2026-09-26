use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, State, WebviewWindow};

use crate::note_mutation::{commit_markdown, emit_changed, CommitCtx, PersistMode};
use crate::space::SpaceState;

use super::Snapshot;

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CurrentNote {
    Missing,
    Present { text: String, etag: String },
}

#[derive(Serialize)]
pub struct SnapshotPreview {
    pub id: i64,
    pub path: String,
    pub text: String,
    pub current: CurrentNote,
}

fn requested_root(
    state: &SpaceState,
    window: &WebviewWindow,
    space_path: &str,
) -> Result<PathBuf, String> {
    let root = state.root_for_window(window)?;
    if root != std::path::Path::new(space_path) {
        return Err("recovery_space_changed".to_string());
    }
    Ok(root)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn recovery_list(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    space_path: String,
    path: Option<String>,
) -> Result<Vec<Snapshot>, String> {
    let root = requested_root(&state, &window, &space_path)?;
    tauri::async_runtime::spawn_blocking(move || super::list(&root, path.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn recovery_preview(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    space_path: String,
    id: i64,
) -> Result<SnapshotPreview, String> {
    let root = requested_root(&state, &window, &space_path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (path, text) = super::read(&root, id)?;
        let current = match super::current_text(&root, &path)? {
            Some(text) => CurrentNote::Present {
                etag: crate::utils::sha256_hex(text.as_bytes()),
                text,
            },
            None => CurrentNote::Missing,
        };
        Ok(SnapshotPreview {
            id,
            path,
            text,
            current,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn recovery_restore(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    space_path: String,
    id: i64,
    expected_path: String,
    expected_etag: Option<String>,
) -> Result<(), String> {
    let root = requested_root(&state, &window, &space_path)?;
    let recent = state.recent_local_changes_for_window(window.label());
    let mutex = state.note_mutation_mutex();
    let window_label = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = mutex
            .lock()
            .map_err(|_| "note mutation mutex poisoned".to_string())?;
        let (path, text) = super::read(&root, id)?;
        if path != expected_path {
            return Err("recovery_conflict".to_string());
        }
        let abs = super::note_path(&root, &path)?;
        let mtime = crate::space_fs::helpers::file_mtime_ms(&abs);
        let current = super::current_text(&root, &path)?;
        let actual_etag = current
            .as_ref()
            .map(|text| crate::utils::sha256_hex(text.as_bytes()));
        if actual_etag != expected_etag {
            return Err("recovery_conflict".to_string());
        }
        let mode = if current.is_some() {
            PersistMode::Replace {
                expected_mtime_ms: Some(mtime),
            }
        } else {
            PersistMode::CreateNew
        };
        let result = commit_markdown(
            &CommitCtx {
                root: &root,
                recent: &recent,
                space_path: &space_path,
            },
            &path,
            &text,
            mode,
        )?;
        if current.is_none() && !result.created {
            return Err("recovery_conflict".to_string());
        }
        // Emit in the worker even if the awaiting IPC request is cancelled.
        let indexed = crate::index::index_note(&root, &path, &text);
        emit_changed(&app, &window_label, &result.change);
        indexed.map_err(|error| {
            tracing::warn!(%error, "restored note could not be indexed");
            "recovery_index_failed".to_string()
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
