use notify::Watcher;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc as std_mpsc;
use tauri::Emitter;

use crate::{index, utils};

use super::state::SpaceState;

#[derive(Serialize, Clone)]
struct ExternalChangeEvent {
    rel_path: String,
}

const DEBOUNCE_MS: u64 = 100;

pub fn set_notes_watcher(
    state: &SpaceState,
    app: tauri::AppHandle,
    root: PathBuf,
) -> Result<(), String> {
    let mut guard = state
        .notes_watcher
        .lock()
        .map_err(|_| "space watcher state poisoned".to_string())?;
    *guard = None;

    let (idx_tx, idx_rx) = std_mpsc::channel::<(String, bool)>();

    let root_idx = root.clone();
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

            for (rel_s, is_remove) in pending {
                if is_remove {
                    let _ = index::remove_note(&root_idx, &rel_s);
                } else {
                    let abs = root_idx.join(&rel_s);
                    if let Ok(markdown) = std::fs::read_to_string(&abs) {
                        let _ = index::index_note(&root_idx, &rel_s, &markdown);
                    }
                }
            }
        }
    });

    let app2 = app.clone();
    let root2 = root.clone();

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

            if utils::is_markdown_path(&path) {
                let _ = idx_tx.send((rel_s.clone(), is_remove));

                let _ = app2.emit(
                    "notes:external_changed",
                    ExternalChangeEvent {
                        rel_path: rel_s.clone(),
                    },
                );
            }

            let _ = app2.emit("space:fs_changed", ExternalChangeEvent { rel_path: rel_s });
        }
    })
    .map_err(|e| e.to_string())?;

    let mut watcher = watcher;
    watcher
        .watch(&root, notify::RecursiveMode::Recursive)
        .map_err(|e: notify::Error| e.to_string())?;

    *guard = Some(watcher);
    Ok(())
}
