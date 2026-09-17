use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
};
use tauri::{State, WebviewWindow};

use crate::index::unlinked_mentions::{
    mention_target, replace_mentions, selected_mentions_are_valid, LinkUnlinkedMentionsResult,
    UnlinkedMention,
};
use crate::note_mutation::{
    commit_markdown, emit_changed, CommitCtx, PersistMode, SpaceChange,
};
use crate::space::state::RecentLocalChanges;
use crate::{index, io_atomic, paths, space::SpaceState, utils};

use super::super::helpers::{deny_hidden_rel_path, etag_for, file_mtime_ms};
use super::super::types::{
    OpenOrCreateTextResult, TextFileDoc, TextFileDocBatch, TextFileWriteResult,
};

fn write_text_under_root(
    root: &Path,
    recent_local_changes: &RecentLocalChanges,
    space_path: &str,
    rel: &Path,
    text: &str,
    expected_mtime_ms: Option<u64>,
) -> Result<(TextFileWriteResult, Option<SpaceChange>), String> {
    deny_hidden_rel_path(rel)?;
    if utils::is_markdown_path(rel) {
        let committed = commit_markdown(
            &CommitCtx {
                root,
                recent: recent_local_changes,
                space_path,
            },
            &rel.to_string_lossy(),
            text,
            PersistMode::Replace { expected_mtime_ms },
        )?;
        return Ok((
            TextFileWriteResult {
                etag: committed.etag,
                mtime_ms: committed.mtime_ms,
            },
            Some(committed.change),
        ));
    }
    let abs = paths::join_under(root, rel)?;
    if let Some(expected) = expected_mtime_ms {
        let actual = file_mtime_ms(&abs);
        if actual == 0 || actual != expected {
            return Err("conflict: on-disk file changed since it was opened".to_string());
        }
    }
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let bytes = text.as_bytes();
    io_atomic::write_atomic(&abs, bytes).map_err(|error| error.to_string())?;
    Ok((
        TextFileWriteResult {
            etag: etag_for(bytes),
            mtime_ms: file_mtime_ms(&abs),
        },
        None,
    ))
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
    let note_mutation_mutex = state.note_mutation_mutex();
    let (result, change) = tauri::async_runtime::spawn_blocking(
        move || -> Result<(TextFileWriteResult, Option<SpaceChange>), String> {
            let _guard = note_mutation_mutex
                .lock()
                .map_err(|_| "note mutation mutex poisoned".to_string())?;
            let rel = PathBuf::from(&path);
            write_text_under_root(
                &root,
                &recent_local_changes,
                &space_path,
                &rel,
                &text,
                base_mtime_ms,
            )
        },
    )
    .await
    .map_err(|e| e.to_string())??;

    if let Some(change) = change {
        emit_changed(&app, &window_label, &change);
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
    let emit_space_path = space_path.clone();
    let window_label = window.label().to_string();
    let recent_local_changes = state.recent_local_changes_for_window(window.label());
    let note_mutation_mutex = state.note_mutation_mutex();
    let (result, changed_paths) = tauri::async_runtime::spawn_blocking(move || {
        let _guard = note_mutation_mutex
            .lock()
            .map_err(|_| "note mutation mutex poisoned".to_string())?;
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
            if !utils::is_markdown_path(&rel) {
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

            let Ok((_, Some(change))) = write_text_under_root(
                &root,
                &recent_local_changes,
                &space_path,
                &rel,
                &next_markdown,
                Some(source_mtime_ms),
            ) else {
                skipped_count += source_mentions.len();
                continue;
            };
            linked_count += source_mentions.len();
            changed_paths.insert(change);
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

    if !changed_paths.is_empty() {
        emit_changed(
            &app,
            &window_label,
            &SpaceChange::batch(emit_space_path, changed_paths.into_iter().collect()),
        );
    }

    Ok(result)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_open_or_create_text(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    path: String,
    text: String,
    space_path: Option<String>,
) -> Result<OpenOrCreateTextResult, String> {
    let root = state.root_for_window(&window)?;
    if let Some(expected) = space_path.as_deref() {
        if root.as_path() != Path::new(expected) {
            return Err("space changed".to_string());
        }
    }
    let space_path = root.to_string_lossy().to_string();
    let window_label = window.label().to_string();
    let recent_local_changes = state.recent_local_changes_for_window(window.label());
    let (result, change) = tauri::async_runtime::spawn_blocking(
        move || -> Result<(OpenOrCreateTextResult, Option<SpaceChange>), String> {
            let rel = PathBuf::from(&path);
            deny_hidden_rel_path(&rel)?;
            if utils::is_markdown_path(&rel) {
                let committed = commit_markdown(
                    &CommitCtx {
                        root: &root,
                        recent: &recent_local_changes,
                        space_path: &space_path,
                    },
                    &rel.to_string_lossy(),
                    &text,
                    PersistMode::CreateNew,
                )?;
                return Ok((
                    OpenOrCreateTextResult {
                        created: committed.created,
                        mtime_ms: committed.mtime_ms,
                    },
                    committed.created.then_some(committed.change),
                ));
            }
            let abs = paths::join_under(&root, &rel)?;
            if abs.exists() {
                return Ok((
                    OpenOrCreateTextResult {
                        created: false,
                        mtime_ms: file_mtime_ms(&abs),
                    },
                    None,
                ));
            }
            if let Some(parent) = abs.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            if !io_atomic::write_atomic_create_new(&abs, text.as_bytes()).map_err(|e| e.to_string())?
            {
                return Ok((
                    OpenOrCreateTextResult {
                        created: false,
                        mtime_ms: file_mtime_ms(&abs),
                    },
                    None,
                ));
            }
            Ok((
                OpenOrCreateTextResult {
                    created: true,
                    mtime_ms: file_mtime_ms(&abs),
                },
                None,
            ))
        },
    )
    .await
    .map_err(|e| e.to_string())??;
    if let Some(change) = change {
        emit_changed(&app, &window_label, &change);
    }
    Ok(result)
}
