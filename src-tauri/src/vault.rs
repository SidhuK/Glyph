use crate::{index, io_atomic, paths};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
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

        let notes_dir = paths::join_under(&root, Path::new("notes"))?;
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
                let file_stem = match path.file_stem().and_then(|s| s.to_str()) {
                    Some(s) => s,
                    None => continue,
                };
                if uuid::Uuid::parse_str(file_stem).is_err() {
                    continue;
                }

                if is_remove {
                    let _ = index::remove_note(&root2, file_stem);
                } else if let Ok(markdown) = std::fs::read_to_string(&path) {
                    let _ = index::index_note(&root2, file_stem, &markdown);
                }

                let _ = app2.emit("notes:external_changed", ExternalNoteChange {
                    id: file_stem.to_string(),
                });
            }
        })
        .map_err(|e| e.to_string())?;

        watcher
            .watch(&notes_dir, notify::RecursiveMode::Recursive)
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

#[derive(Serialize)]
struct VaultJson {
    schema_version: u32,
    created_at_ms: u128,
}

const VAULT_SCHEMA_VERSION: u32 = 1;

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn ensure_vault_dirs(root: &Path) -> Result<(), String> {
    std::fs::create_dir_all(root.join("notes")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(root.join("canvases")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(root.join("assets")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(root.join("cache")).map_err(|e| e.to_string())?;
    Ok(())
}

fn write_vault_json_if_missing(root: &Path) -> Result<u32, String> {
    let path = paths::join_under(root, Path::new("vault.json"))?;
    if path.exists() {
        // Keep it simple for now: Step 3 just needs the harness in place.
        // We'll implement schema parsing + migrations when we add more fields.
        return Ok(VAULT_SCHEMA_VERSION);
    }

    let payload = VaultJson {
        schema_version: VAULT_SCHEMA_VERSION,
        created_at_ms: now_ms(),
    };
    let bytes = serde_json::to_vec_pretty(&payload).map_err(|e| e.to_string())?;
    io_atomic::write_atomic(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(VAULT_SCHEMA_VERSION)
}

fn canonicalize_dir(path: &Path) -> Result<PathBuf, String> {
    let p = path.canonicalize().map_err(|e| e.to_string())?;
    if !p.is_dir() {
        return Err("selected path is not a directory".to_string());
    }
    Ok(p)
}

fn create_or_open_impl(root: &Path) -> Result<VaultInfo, String> {
    ensure_vault_dirs(root)?;
    let _ = cleanup_tmp_files(root);
    let schema_version = write_vault_json_if_missing(root)?;
    Ok(VaultInfo {
        root: root.to_string_lossy().to_string(),
        schema_version,
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

    for rel in ["notes", "canvases", "cache", "assets"] {
        let dir = root.join(rel);
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
