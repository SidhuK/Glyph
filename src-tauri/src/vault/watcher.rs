use notify::Watcher;
use serde::Serialize;
use std::path::PathBuf;
use tauri::Emitter;

use crate::index;

use super::state::VaultState;

#[derive(Serialize, Clone)]
struct ExternalChangeEvent {
    rel_path: String,
}

fn is_markdown_path(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
        .unwrap_or(false)
}

pub fn set_notes_watcher(
    state: &VaultState,
    app: tauri::AppHandle,
    root: PathBuf,
) -> Result<(), String> {
    let mut guard = state
        .notes_watcher
        .lock()
        .map_err(|_| "vault watcher state poisoned".to_string())?;
    *guard = None;

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

            if is_markdown_path(&path) {
                if is_remove {
                    let _ = index::remove_note(&root2, &rel_s);
                } else if let Ok(markdown) = std::fs::read_to_string(&path) {
                    let _ = index::index_note(&root2, &rel_s, &markdown);
                }

                let _ = app2.emit(
                    "notes:external_changed",
                    ExternalChangeEvent {
                        rel_path: rel_s.clone(),
                    },
                );
            }

            let _ = app2.emit("vault:fs_changed", ExternalChangeEvent { rel_path: rel_s });
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
