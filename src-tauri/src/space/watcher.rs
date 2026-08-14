use notify::event::{EventKind, ModifyKind};
use notify::Watcher;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc as std_mpsc;

use crate::note_mutation::{emit_changed, SpaceChange};
use crate::{index, paths, utils};

use super::state::{has_recent_local_change, RecentLocalChanges};

const DEBOUNCE_MS: u64 = 100;
const INDEX_OPEN_RETRY_MS: u64 = 1_000;

fn rel_under_root(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let rel_s = rel
        .components()
        .filter_map(|c| c.as_os_str().to_str())
        .collect::<Vec<_>>()
        .join("/");
    if rel_s.is_empty() || rel_s.split('/').any(|part| part.starts_with('.')) {
        return None;
    }
    Some(rel_s)
}

pub fn create_notes_watcher(
    app: tauri::AppHandle,
    root: PathBuf,
    window_label: String,
    recent_local_changes: RecentLocalChanges,
) -> Result<notify::RecommendedWatcher, String> {
    let (idx_tx, idx_rx) = std_mpsc::channel::<(String, bool, bool)>();

    let root_idx = root.clone();
    let index_app = app.clone();
    let index_window_label = window_label.clone();
    let index_space_path = root.to_string_lossy().to_string();
    std::thread::spawn(move || {
        let debounce = std::time::Duration::from_millis(DEBOUNCE_MS);
        let mut pending = HashMap::new();
        loop {
            if pending.is_empty() {
                let Ok((rel, remove, emit)) = idx_rx.recv() else {
                    return;
                };
                pending.insert(rel, (remove, emit));
            }

            let deadline = std::time::Instant::now() + debounce;
            loop {
                let remaining = deadline.saturating_duration_since(std::time::Instant::now());
                if remaining.is_zero() {
                    break;
                }
                match idx_rx.recv_timeout(remaining) {
                    Ok((rel, remove, emit)) => {
                        pending.insert(rel, (remove, emit));
                    }
                    Err(std_mpsc::RecvTimeoutError::Timeout) => break,
                    Err(std_mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }

            let conn = match index::open_db(&root_idx) {
                Ok(conn) => conn,
                Err(error) => {
                    tracing::warn!(%error, "could not open note index for watcher batch");
                    std::thread::sleep(std::time::Duration::from_millis(INDEX_OPEN_RETRY_MS));
                    continue;
                }
            };
            let mut changes = Vec::new();
            for (rel_s, (is_remove, emit)) in std::mem::take(&mut pending) {
                let result = if is_remove {
                    index::remove_note_with_conn(&conn, &rel_s)
                } else {
                    let abs = match paths::join_under(&root_idx, Path::new(&rel_s)) {
                        Ok(abs) => abs,
                        Err(_) => continue,
                    };
                    if let Ok(markdown) = std::fs::read_to_string(&abs) {
                        index::index_note_with_conn(&conn, &rel_s, &markdown, &abs)
                    } else {
                        continue;
                    }
                };
                if result.is_ok() && emit {
                    changes.push(if is_remove {
                        SpaceChange::remove(&index_space_path, rel_s, false)
                    } else {
                        SpaceChange::content(&index_space_path, rel_s)
                    });
                }
            }

            if !changes.is_empty() {
                emit_changed(
                    &index_app,
                    &index_window_label,
                    &SpaceChange::batch(&index_space_path, changes),
                );
            }
        }
    });

    let app2 = app.clone();
    let root2 = root.clone();
    let space_path = root.to_string_lossy().to_string();

    let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let event = match res {
            Ok(e) => e,
            Err(_) => return,
        };

        if let EventKind::Modify(ModifyKind::Name(_)) = event.kind {
            if event.paths.len() >= 2 {
                let Some(from) = rel_under_root(&root2, &event.paths[0]) else {
                    return;
                };
                let Some(to) = rel_under_root(&root2, &event.paths[1]) else {
                    return;
                };
                if utils::is_markdown_path(&event.paths[1])
                    && !has_recent_local_change(&recent_local_changes, &from)
                    && !has_recent_local_change(&recent_local_changes, &to)
                {
                    let _ = idx_tx.send((from.clone(), true, false));
                    let _ = idx_tx.send((to.clone(), false, false));
                }
                emit_changed(
                    &app2,
                    &window_label,
                    &SpaceChange::rename(&space_path, from, to, false),
                );
                return;
            }
        }

        let is_remove = matches!(event.kind, EventKind::Remove(_));
        let is_create = matches!(event.kind, EventKind::Create(_));
        let is_modify = matches!(event.kind, EventKind::Modify(_));
        if !(is_remove || is_create || is_modify) {
            return;
        }

        for path in event.paths {
            let Some(rel_s) = rel_under_root(&root2, &path) else {
                continue;
            };

            let is_md = utils::is_markdown_path(&path);
            if is_md {
                if !has_recent_local_change(&recent_local_changes, &rel_s) {
                    let _ = idx_tx.send((rel_s, is_remove, true));
                }
                continue;
            }

            let change = if is_remove {
                SpaceChange::remove(&space_path, rel_s, true)
            } else if is_create {
                SpaceChange::create(&space_path, rel_s)
            } else {
                SpaceChange::content(&space_path, rel_s)
            };
            emit_changed(&app2, &window_label, &change);
        }
    })
    .map_err(|e| e.to_string())?;

    let mut watcher = watcher;
    watcher
        .watch(&root, notify::RecursiveMode::Recursive)
        .map_err(|e: notify::Error| e.to_string())?;

    Ok(watcher)
}
