use notify::Watcher;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc as std_mpsc;
use tauri::Emitter;

use crate::{index, paths, utils};

use super::state::{has_recent_local_change, RecentLocalChanges};

#[derive(Serialize, Clone)]
struct ExternalChangeEvent {
    space_path: String,
    rel_path: String,
    removed: bool,
}

const DEBOUNCE_MS: u64 = 100;

pub fn create_notes_watcher(
    app: tauri::AppHandle,
    root: PathBuf,
    window_label: String,
    recent_local_changes: RecentLocalChanges,
) -> Result<notify::RecommendedWatcher, String> {
    let (idx_tx, idx_rx) = std_mpsc::channel::<(String, bool)>();

    let root_idx = root.clone();
    let index_app = app.clone();
    let index_window_label = window_label.clone();
    let index_space_path = root.to_string_lossy().to_string();
    std::thread::spawn(move || {
        let debounce = std::time::Duration::from_millis(DEBOUNCE_MS);
        while let Ok(first) = idx_rx.recv() {
            let mut pending = HashMap::new();
            pending.insert(first.0, first.1);

            let deadline = std::time::Instant::now() + debounce;
            loop {
                let remaining = deadline.saturating_duration_since(std::time::Instant::now());
                if remaining.is_zero() {
                    break;
                }
                match idx_rx.recv_timeout(remaining) {
                    Ok((rel, remove)) => {
                        pending.insert(rel, remove);
                    }
                    Err(std_mpsc::RecvTimeoutError::Timeout) => break,
                    Err(std_mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }

            let mut events = Vec::new();
            for (rel_s, is_remove) in pending {
                let result = if is_remove {
                    index::remove_note(&root_idx, &rel_s)
                } else {
                    let abs = match paths::join_under(&root_idx, Path::new(&rel_s)) {
                        Ok(abs) => abs,
                        Err(_) => continue,
                    };
                    if let Ok(markdown) = std::fs::read_to_string(&abs) {
                        index::index_note(&root_idx, &rel_s, &markdown)
                    } else {
                        continue;
                    }
                };
                if result.is_ok() {
                    events.push(ExternalChangeEvent {
                        space_path: index_space_path.clone(),
                        rel_path: rel_s,
                        removed: is_remove,
                    });
                }
            }

            for event in events {
                let _ = index_app.emit_to(&index_window_label, "notes:external_changed", event);
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

        let is_remove = matches!(event.kind, notify::EventKind::Remove(_));
        let is_create = matches!(event.kind, notify::EventKind::Create(_));
        let is_modify = matches!(event.kind, notify::EventKind::Modify(_));
        if !(is_remove || is_create || is_modify) {
            return;
        }

        for path in event.paths {
            let rel = match path.strip_prefix(&root2) {
                Ok(r) => r,
                Err(_) => continue,
            };
            let rel_s = rel
                .components()
                .filter_map(|c| c.as_os_str().to_str())
                .collect::<Vec<_>>()
                .join("/");
            if rel_s.is_empty() {
                continue;
            }
            if rel_s.split('/').any(|p| p.starts_with('.')) {
                continue;
            }

            if utils::is_markdown_path(&path)
                && !has_recent_local_change(&recent_local_changes, &rel_s)
            {
                let _ = idx_tx.send((rel_s.clone(), is_remove));
            }

            let _ = app2.emit_to(
                &window_label,
                "space:fs_changed",
                ExternalChangeEvent {
                    space_path: space_path.clone(),
                    rel_path: rel_s,
                    removed: is_remove,
                },
            );
        }
    })
    .map_err(|e| e.to_string())?;

    let mut watcher = watcher;
    watcher
        .watch(&root, notify::RecursiveMode::Recursive)
        .map_err(|e: notify::Error| e.to_string())?;

    Ok(watcher)
}
