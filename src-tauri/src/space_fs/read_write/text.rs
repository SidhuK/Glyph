use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    ffi::OsStr,
    path::{Path, PathBuf},
};
use tauri::{Emitter, State, WebviewWindow};

use crate::index::unlinked_mentions::{
    mention_target, replace_mentions, selected_mentions_are_valid, LinkUnlinkedMentionsResult,
    UnlinkedMention,
};
use crate::space::state::{mark_recent_local_change, RecentLocalChanges};
use crate::{index, io_atomic, paths, space::SpaceState};

use super::super::helpers::{deny_hidden_rel_path, etag_for, file_mtime_ms};
use super::super::types::{
    OpenOrCreateTextResult, TextFileDoc, TextFileDocBatch, TextFileWriteResult,
};

#[derive(Serialize, Clone)]
struct NoteChangeEvent {
    space_path: String,
    rel_path: String,
    removed: bool,
}

fn write_text_under_root(
    root: &Path,
    recent_local_changes: &RecentLocalChanges,
    rel: &Path,
    text: &str,
    expected_mtime_ms: Option<u64>,
) -> Result<TextFileWriteResult, String> {
    deny_hidden_rel_path(rel)?;
    let abs = paths::join_under(root, rel)?;
    if let Some(expected) = expected_mtime_ms {
        let actual = file_mtime_ms(&abs);
        if actual != 0 && actual != expected {
            return Err("conflict: on-disk file changed since it was opened".to_string());
        }
    }
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let rel_path = rel.to_string_lossy().to_string();
    let should_index = rel.extension() == Some(OsStr::new("md"));
    let bytes = text.as_bytes();
    io_atomic::write_atomic(&abs, bytes).map_err(|error| error.to_string())?;
    if should_index {
        if let Err(error) = index::index_note(root, &rel_path, text) {
            tracing::warn!(note_id = %rel_path, %error, "saved note could not be indexed");
        } else {
            mark_recent_local_change(recent_local_changes, &rel_path);
        }
    }

    Ok(TextFileWriteResult {
        etag: etag_for(bytes),
        mtime_ms: file_mtime_ms(&abs),
    })
}

#[tauri::command]
pub async fn space_read_text(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    path: String,
) -> Result<TextFileDoc, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<TextFileDoc, String> {
        let rel = PathBuf::from(&path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        let bytes = std::fs::read(&abs).map_err(|e| e.to_string())?;
        let text =
            String::from_utf8(bytes.clone()).map_err(|_| "file is not valid UTF-8".to_string())?;
        Ok(TextFileDoc {
            rel_path: rel.to_string_lossy().to_string(),
            etag: etag_for(&bytes),
            mtime_ms: file_mtime_ms(&abs),
            text,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn space_read_texts_batch(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    paths: Vec<String>,
) -> Result<Vec<TextFileDocBatch>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<TextFileDocBatch>, String> {
        let mut results = Vec::with_capacity(paths.len());
        for path in paths {
            let rel = PathBuf::from(&path);
            let result = (|| -> Result<TextFileDocBatch, String> {
                deny_hidden_rel_path(&rel)?;
                let abs = paths::join_under(&root, &rel)?;
                let bytes = std::fs::read(&abs).map_err(|e| e.to_string())?;
                let text = String::from_utf8(bytes.clone())
                    .map_err(|_| "file is not valid UTF-8".to_string())?;
                Ok(TextFileDocBatch {
                    rel_path: rel.to_string_lossy().to_string(),
                    text: Some(text),
                    etag: Some(etag_for(&bytes)),
                    mtime_ms: file_mtime_ms(&abs),
                    error: None,
                })
            })();
            match result {
                Ok(doc) => results.push(doc),
                Err(error) => results.push(TextFileDocBatch {
                    rel_path: path,
                    text: None,
                    etag: None,
                    mtime_ms: 0,
                    error: Some(error),
                }),
            }
        }
        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_write_text(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    path: String,
    text: String,
    base_mtime_ms: Option<u64>,
) -> Result<TextFileWriteResult, String> {
    let root = state.root_for_window(&window)?;
    let space_path = root.to_string_lossy().to_string();
    let window_label = window.label().to_string();
    let recent_local_changes = state.recent_local_changes_for_window(window.label());
    let event_rel_path = PathBuf::from(&path).to_string_lossy().to_string();
    let should_emit_note_change = PathBuf::from(&path).extension() == Some(OsStr::new("md"));
    let result =
        tauri::async_runtime::spawn_blocking(move || -> Result<TextFileWriteResult, String> {
            let rel = PathBuf::from(&path);
            deny_hidden_rel_path(&rel)?;
            write_text_under_root(&root, &recent_local_changes, &rel, &text, base_mtime_ms)
        })
        .await
        .map_err(|e| e.to_string())??;

    if should_emit_note_change {
        // Local writes are filtered out by the filesystem watcher, so publish the
        // same note-change event here. If indexing failed, the unmarked watcher
        // event retries it without making the saved document appear to fail.
        let _ = app.emit_to(
            window_label,
            "notes:external_changed",
            NoteChangeEvent {
                space_path,
                rel_path: event_rel_path,
                removed: false,
            },
        );
    }

    Ok(result)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_link_unlinked_mentions(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    target_note_id: String,
    mentions: Vec<UnlinkedMention>,
) -> Result<LinkUnlinkedMentionsResult, String> {
    let root = state.root_for_window(&window)?;
    let space_path = root.to_string_lossy().to_string();
    let window_label = window.label().to_string();
    let recent_local_changes = state.recent_local_changes_for_window(window.label());
    let (result, changed_paths) = tauri::async_runtime::spawn_blocking(move || {
        let conn = index::open_db(&root)?;
        let target = mention_target(&conn, &target_note_id)?;
        let mut grouped = HashMap::<String, Vec<UnlinkedMention>>::new();
        for mention in mentions {
            grouped
                .entry(mention.source_id.clone())
                .or_default()
                .push(mention);
        }
        let mut changed_paths = HashSet::new();
        let mut linked_count = 0;
        let mut skipped_count = 0;

        for (source_id, source_mentions) in grouped {
            let rel = PathBuf::from(&source_id);
            if rel.extension() != Some(OsStr::new("md")) {
                skipped_count += source_mentions.len();
                continue;
            }
            if deny_hidden_rel_path(&rel).is_err() {
                skipped_count += source_mentions.len();
                continue;
            }
            let Ok(abs) = paths::join_under(&root, &rel) else {
                skipped_count += source_mentions.len();
                continue;
            };
            let source_mtime_before_read = file_mtime_ms(&abs);
            let markdown = match std::fs::read_to_string(&abs) {
                Ok(markdown) => markdown,
                Err(_) => {
                    skipped_count += source_mentions.len();
                    continue;
                }
            };
            let source_mtime_ms = file_mtime_ms(&abs);
            if source_mtime_ms != source_mtime_before_read {
                skipped_count += source_mentions.len();
                continue;
            }
            if !selected_mentions_are_valid(&markdown, &target, &source_mentions) {
                skipped_count += source_mentions.len();
                continue;
            }
            let next_markdown = match replace_mentions(&markdown, &target, &source_mentions) {
                Ok(markdown) => markdown,
                Err(_) => {
                    skipped_count += source_mentions.len();
                    continue;
                }
            };

            if write_text_under_root(
                &root,
                &recent_local_changes,
                &rel,
                &next_markdown,
                Some(source_mtime_ms),
            )
            .is_err()
            {
                skipped_count += source_mentions.len();
                continue;
            }
            linked_count += source_mentions.len();
            changed_paths.insert(source_id);
        }

        Ok::<_, String>((
            LinkUnlinkedMentionsResult {
                linked_count,
                skipped_count,
            },
            changed_paths,
        ))
    })
    .await
    .map_err(|error| error.to_string())??;

    for rel_path in changed_paths {
        let _ = app.emit_to(
            &window_label,
            "notes:external_changed",
            NoteChangeEvent {
                space_path: space_path.clone(),
                rel_path,
                removed: false,
            },
        );
    }

    Ok(result)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_open_or_create_text(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    path: String,
    text: String,
) -> Result<OpenOrCreateTextResult, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<OpenOrCreateTextResult, String> {
        let rel = PathBuf::from(&path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;

        if abs.exists() {
            return Ok(OpenOrCreateTextResult {
                created: false,
                mtime_ms: file_mtime_ms(&abs),
            });
        }

        if let Some(parent) = abs.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if !io_atomic::write_atomic_create_new(&abs, text.as_bytes()).map_err(|e| e.to_string())? {
            return Ok(OpenOrCreateTextResult {
                created: false,
                mtime_ms: file_mtime_ms(&abs),
            });
        }
        Ok(OpenOrCreateTextResult {
            created: true,
            mtime_ms: file_mtime_ms(&abs),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
