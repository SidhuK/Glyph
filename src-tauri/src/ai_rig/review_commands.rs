use super::review::{commit, load, recover, EditStatus, NoteEdit, REVIEW_LOCK};
use super::review_files::{FileEdit, Files, ReviewError, WriteContext};
use crate::{glyph_paths, paths, space::SpaceState};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};
use tauri::{AppHandle, Manager, State, WebviewWindow};

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Decision {
    Accept { edit_id: String },
    Reject { edit_id: String },
    Undo,
    Resume,
}

#[derive(Serialize)]
pub struct ReviewOperation {
    job_id: String,
    created_at_ms: u64,
    finished: bool,
    recovery_required: bool,
    edits: Vec<NoteEdit>,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_edits_resolve(
    app: AppHandle,
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    job_id: String,
    decision: Decision,
) -> Result<(), ReviewError> {
    let root = space_state.root_for_window(&window)?;
    let label = window.label().to_string();
    let recent = space_state.recent_local_changes_for_window(&label);
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = REVIEW_LOCK.lock().map_err(|e| e.to_string())?;
        let mut op = load(&root, &job_id)?;
        if app.state::<super::AiState>().is_running(&job_id) {
            return Err(ReviewError::Busy);
        }
        let ctx = WriteContext {
            root: &root,
            app: &app,
            window_label: &label,
            recent: &recent,
        };
        if matches!(decision, Decision::Resume) {
            return recover(&ctx, &mut op);
        }
        if op.transaction.is_some() {
            return Err(ReviewError::RecoveryRequired);
        }
        let mut files = Files::new();
        let accept = matches!(&decision, Decision::Accept { .. });
        match decision {
            Decision::Resume => return Ok(()),
            Decision::Undo => {
                for edit in &mut op.edits {
                    if edit.status == EditStatus::Accepted {
                        for (path, file) in &edit.files {
                            files.insert(
                                path.clone(),
                                FileEdit {
                                    before: file.after.clone(),
                                    after: file.before.clone(),
                                },
                            );
                        }
                        edit.status = EditStatus::Undone;
                    } else if edit.status == EditStatus::Pending {
                        edit.status = EditStatus::Rejected;
                    }
                }
            }
            Decision::Accept { edit_id } | Decision::Reject { edit_id } => {
                let edit = op
                    .edits
                    .iter_mut()
                    .find(|edit| edit.id == edit_id)
                    .ok_or(ReviewError::InvalidOperation)?;
                if edit.status != EditStatus::Pending {
                    return Err(ReviewError::AlreadyReviewed);
                }
                if accept {
                    files = edit.files.clone();
                    edit.status = EditStatus::Accepted;
                } else {
                    edit.status = EditStatus::Rejected;
                }
            }
        }
        commit(&ctx, &mut op, files)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_edits_list(
    app: AppHandle,
    window: WebviewWindow,
    space_state: State<'_, SpaceState>,
    thread_id: String,
) -> Result<Vec<ReviewOperation>, ReviewError> {
    uuid::Uuid::parse_str(&thread_id).map_err(|_| ReviewError::InvalidOperation)?;
    let root = space_state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = REVIEW_LOCK.lock().map_err(|e| e.to_string())?;
        let dir = paths::join_under(&glyph_paths::ai_history_dir(&root)?, Path::new("edits"))?;
        let entries = match fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
            Err(e) => return Err(e.to_string().into()),
        };
        let mut operations = vec![];
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name();
            let Some(id) = name.to_str().and_then(|name| name.strip_suffix(".json")) else {
                continue;
            };
            let op = load(&root, id)?;
            if op.thread_id == thread_id {
                operations.push(ReviewOperation {
                    finished: !app.state::<super::AiState>().is_running(id),
                    recovery_required: op.transaction.is_some(),
                    job_id: op.job_id,
                    created_at_ms: op.created_at_ms,
                    edits: op.edits,
                });
            }
        }
        operations.sort_by_key(|operation| operation.created_at_ms);
        Ok(operations)
    })
    .await
    .map_err(|e| e.to_string())?
}
