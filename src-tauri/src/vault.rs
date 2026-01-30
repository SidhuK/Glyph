use crate::{io_atomic, paths};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;

#[derive(Default)]
pub struct VaultState {
    current: Mutex<Option<PathBuf>>,
}

impl VaultState {
    pub fn current_root(&self) -> Result<PathBuf, String> {
        let guard = self.current.lock().map_err(|_| "vault state poisoned".to_string())?;
        guard
            .clone()
            .ok_or_else(|| "no vault open (select or create a vault first)".to_string())
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
    let schema_version = write_vault_json_if_missing(root)?;
    Ok(VaultInfo {
        root: root.to_string_lossy().to_string(),
        schema_version,
    })
}

#[tauri::command]
pub async fn vault_create(state: State<'_, VaultState>, path: String) -> Result<VaultInfo, String> {
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
    Ok(info)
}

#[tauri::command]
pub async fn vault_open(state: State<'_, VaultState>, path: String) -> Result<VaultInfo, String> {
    let root = PathBuf::from(path);
    let info = tauri::async_runtime::spawn_blocking(move || -> Result<VaultInfo, String> {
        let root = canonicalize_dir(&root)?;
        create_or_open_impl(&root)
    })
    .await
    .map_err(|e| e.to_string())??;

    let mut guard = state.current.lock().map_err(|_| "vault state poisoned".to_string())?;
    *guard = Some(PathBuf::from(&info.root));
    Ok(info)
}

#[tauri::command]
pub fn vault_get_current(state: State<'_, VaultState>) -> Option<String> {
    let guard = state.current.lock().ok()?;
    guard.as_ref().map(|p| p.to_string_lossy().to_string())
}
