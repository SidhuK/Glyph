mod scan;

use std::{collections::HashMap, path::Path};

use serde::Serialize;
use tauri::{State, WebviewWindow};

use crate::note_mutation::{emit_changed, SpaceChange};
use crate::space::state::mark_recent_local_change;
use crate::{paths, space::SpaceState};

use super::trash::move_path_to_trash;
use scan::{AttachmentEntry, AttachmentScan};

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AttachmentTrashSkip {
    /// The file is gone or is no longer an attachment.
    Missing {
        path: String,
    },
    /// A note started referencing the file after the scan the user reviewed.
    Referenced {
        path: String,
    },
    Failed {
        path: String,
        message: String,
    },
}

#[derive(Serialize)]
pub struct AttachmentTrashResult {
    pub trashed: Vec<String>,
    pub skipped: Vec<AttachmentTrashSkip>,
}

#[tauri::command]
pub async fn space_scan_attachments(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
) -> Result<AttachmentScan, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || scan::scan_attachments(&root))
        .await
        .map_err(|e| e.to_string())?
}

/// Moves unreferenced attachments to the macOS Trash. The space is rescanned
/// first so a file that gained a reference since the user's review is kept,
/// and in-app note saves are held off until the batch finishes.
#[tauri::command(rename_all = "snake_case")]
pub async fn space_trash_unused_attachments(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    rel_paths: Vec<String>,
) -> Result<AttachmentTrashResult, String> {
    let root = state.root_for_window(&window)?;
    let space_path = root.to_string_lossy().to_string();
    let window_label = window.label().to_string();
    let recent_local_changes = state.recent_local_changes_for_window(window.label());
    let note_mutation_mutex = state.note_mutation_mutex();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        let _guard = note_mutation_mutex
            .lock()
            .map_err(|_| "note mutation mutex poisoned".to_string())?;
        let current: HashMap<String, AttachmentEntry> = scan::scan_attachments(&root)?
            .attachments
            .into_iter()
            .map(|entry| (entry.rel_path.clone(), entry))
            .collect();
        let mut result = AttachmentTrashResult {
            trashed: Vec::new(),
            skipped: Vec::new(),
        };
        for path in rel_paths {
            let Some(entry) = current.get(&path) else {
                result.skipped.push(AttachmentTrashSkip::Missing { path });
                continue;
            };
            if !entry.referenced_by.is_empty() {
                result
                    .skipped
                    .push(AttachmentTrashSkip::Referenced { path });
                continue;
            }
            // Only paths the scan just returned reach here, so they are visible
            // files under the root; attachments are never indexed notes.
            match paths::join_under(&root, Path::new(&path))
                .and_then(|abs| move_path_to_trash(&abs))
            {
                Ok(()) => {
                    mark_recent_local_change(&recent_local_changes, &path);
                    result.trashed.push(path);
                }
                Err(message) => {
                    tracing::warn!(%path, %message, "failed to trash unused attachment");
                    result
                        .skipped
                        .push(AttachmentTrashSkip::Failed { path, message });
                }
            }
        }
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())??;
    if !result.trashed.is_empty() {
        let changes = result
            .trashed
            .iter()
            .map(|path| SpaceChange::remove(space_path.clone(), path.clone(), false))
            .collect();
        emit_changed(
            &app,
            &window_label,
            &SpaceChange::batch(space_path, changes),
        );
    }
    Ok(result)
}
