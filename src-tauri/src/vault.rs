use crate::{index, tether_paths};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use notify::Watcher;
use tauri::Emitter;
use tauri::State;

pub struct VaultState {
    current: Mutex<Option<PathBuf>>,
    notes_watcher: Mutex<Option<notify::RecommendedWatcher>>,
}

impl Default for VaultState {
    fn default() -> Self {
        Self {
            current: Mutex::new(None),
            notes_watcher: Mutex::new(None),
        }
    }
}

impl VaultState {
    pub fn current_root(&self) -> Result<PathBuf, String> {
        let guard = self.current.lock().map_err(|_| "vault state poisoned".to_string())?;
        guard
            .clone()
            .ok_or_else(|| "no vault open (select or create a vault first)".to_string())
    }

    fn set_notes_watcher(&self, app: tauri::AppHandle, root: PathBuf) -> Result<(), String> {
        let mut guard = self
            .notes_watcher
            .lock()
            .map_err(|_| "vault watcher state poisoned".to_string())?;
        *guard = None;

        let app2 = app.clone();
        let root2 = root.clone();

        #[derive(Serialize, Clone)]
        struct ExternalNoteChange {
            id: String,
        }

        let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
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
                if path.extension() != Some(std::ffi::OsStr::new("md")) {
                    continue;
                }
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

                if is_remove {
                    let _ = index::remove_note(&root2, &rel_s);
                } else if let Ok(markdown) = std::fs::read_to_string(&path) {
                    let _ = index::index_note(&root2, &rel_s, &markdown);
                }

                let _ = app2.emit(
                    "notes:external_changed",
                    ExternalNoteChange { id: rel_s },
                );
            }
        })
        .map_err(|e| e.to_string())?;

        watcher
            .watch(&root, notify::RecursiveMode::Recursive)
            .map_err(|e: notify::Error| e.to_string())?;

        *guard = Some(watcher);
        Ok(())
    }
}

#[derive(Serialize)]
pub struct VaultInfo {
    pub root: String,
    pub schema_version: u32,
}

const VAULT_SCHEMA_VERSION: u32 = 1;

fn ensure_tether_dirs(root: &Path) -> Result<(), String> {
    let _ = tether_paths::ensure_tether_dir(root)?;
    let _ = tether_paths::ensure_tether_cache_dir(root)?;
    Ok(())
}

fn canonicalize_dir(path: &Path) -> Result<PathBuf, String> {
    let p = path.canonicalize().map_err(|e| e.to_string())?;
    if !p.is_dir() {
        return Err("selected path is not a directory".to_string());
    }
    Ok(p)
}

fn create_or_open_impl(root: &Path) -> Result<VaultInfo, String> {
    ensure_tether_dirs(root)?;
    let _ = cleanup_tmp_files(root);
    Ok(VaultInfo {
        root: root.to_string_lossy().to_string(),
        schema_version: VAULT_SCHEMA_VERSION,
    })
}

fn cleanup_tmp_files(root: &Path) -> Result<(), String> {
    fn should_delete(file_name: &str) -> bool {
        // Our atomic writer uses dotfiles containing ".tmp.".
        (file_name.starts_with('.') && file_name.contains(".tmp."))
            || file_name.ends_with(".tmp")
            || file_name.contains(".import.tmp.")
    }

    fn recurse(dir: &Path) -> Result<(), String> {
        let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let path = entry.path();
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_dir() {
                let _ = recurse(&path);
                continue;
            }
            if !meta.is_file() {
                continue;
            }
            let name = match path.file_name().and_then(|s| s.to_str()) {
                Some(s) => s,
                None => continue,
            };
            if !should_delete(name) {
                continue;
            }
            let _ = std::fs::remove_file(&path);
        }
        Ok(())
    }

    if let Ok(dir) = tether_paths::tether_dir(root) {
        if dir.is_dir() {
            let _ = recurse(&dir);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn vault_create(app: tauri::AppHandle, state: State<'_, VaultState>, path: String) -> Result<VaultInfo, String> {
    let root = PathBuf::from(path);
    let info = tauri::async_runtime::spawn_blocking(move || -> Result<VaultInfo, String> {
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let root = canonicalize_dir(&root)?;
        create_or_open_impl(&root)
    })
    .await
    .map_err(|e| e.to_string())??;

    let mut guard = state.current.lock().map_err(|_| "vault state poisoned".to_string())?;
    *guard = Some(PathBuf::from(&info.root));
    drop(guard);
    let _ = state.set_notes_watcher(app, PathBuf::from(&info.root));
    Ok(info)
}

#[tauri::command]
pub async fn vault_open(app: tauri::AppHandle, state: State<'_, VaultState>, path: String) -> Result<VaultInfo, String> {
    let root = PathBuf::from(path);
    let info = tauri::async_runtime::spawn_blocking(move || -> Result<VaultInfo, String> {
        let root = canonicalize_dir(&root)?;
        create_or_open_impl(&root)
    })
    .await
    .map_err(|e| e.to_string())??;

    let mut guard = state.current.lock().map_err(|_| "vault state poisoned".to_string())?;
    *guard = Some(PathBuf::from(&info.root));
    drop(guard);
    let _ = state.set_notes_watcher(app, PathBuf::from(&info.root));
    Ok(info)
}

#[tauri::command]
pub fn vault_get_current(state: State<'_, VaultState>) -> Option<String> {
    let guard = state.current.lock().ok()?;
    guard.as_ref().map(|p| p.to_string_lossy().to_string())
}
