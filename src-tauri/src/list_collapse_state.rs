use std::{
    collections::BTreeMap,
    path::{Component, Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{State, WebviewWindow};

use crate::{
    glyph_paths::{ensure_glyph_dir, glyph_dir},
    io_atomic,
    space::SpaceState,
    space_fs::helpers::deny_hidden_rel_path,
};

const STORE_FILE: &str = "list_collapse_state.json";
const STORE_VERSION: u32 = 1;

#[derive(Deserialize, Serialize)]
struct Store {
    version: u32,
    #[serde(default)]
    entries: BTreeMap<String, Vec<String>>,
}

fn empty_store() -> Store {
    Store {
        version: STORE_VERSION,
        entries: BTreeMap::new(),
    }
}

fn normalize_path(path: &str) -> Option<String> {
    let path = PathBuf::from(path.trim());
    if path.as_os_str().is_empty() || path.is_absolute() || deny_hidden_rel_path(&path).is_err() {
        return None;
    }
    let parts = path
        .components()
        .map(|component| match component {
            Component::Normal(part) => part.to_str(),
            _ => None,
        })
        .collect::<Option<Vec<_>>>()?;
    (!parts.is_empty()).then(|| parts.join("/"))
}

fn normalize_branches(mut branches: Vec<String>) -> Vec<String> {
    branches = branches
        .into_iter()
        .filter_map(|branch| {
            let branch = branch.trim().to_string();
            (!branch.is_empty() && branch.len() <= 512).then_some(branch)
        })
        .collect();
    branches.sort();
    branches.dedup();
    branches
}

fn load(root: &Path) -> Result<Store, String> {
    let path = glyph_dir(root)?.join(STORE_FILE);
    let mut store = match std::fs::read(&path) {
        Ok(bytes) => match serde_json::from_slice::<Store>(&bytes) {
            Ok(store) => store,
            Err(error) => {
                tracing::warn!(path = %path.display(), %error, "invalid list collapse state store; ignoring it");
                return Ok(empty_store());
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(empty_store()),
        Err(error) => return Err(error.to_string()),
    };
    if store.version > STORE_VERSION {
        return Err(format!(
            "unsupported list collapse state store version {} (max supported {})",
            store.version, STORE_VERSION
        ));
    }
    store.version = STORE_VERSION;
    store.entries = store
        .entries
        .into_iter()
        .filter_map(|(path, branches)| {
            let path = normalize_path(&path)?;
            let branches = normalize_branches(branches);
            (!branches.is_empty()).then_some((path, branches))
        })
        .collect();
    Ok(store)
}

fn save(root: &Path, store: &Store) -> Result<(), String> {
    let path = ensure_glyph_dir(root)?.join(STORE_FILE);
    let bytes = serde_json::to_vec_pretty(store).map_err(|error| error.to_string())?;
    io_atomic::write_atomic(&path, &bytes).map_err(|error| error.to_string())
}

fn branches_for(root: &Path, path: &str) -> Result<Vec<String>, String> {
    let path = normalize_path(path).ok_or_else(|| "path is required".to_string())?;
    Ok(load(root)?.entries.get(&path).cloned().unwrap_or_default())
}

fn set_branches(root: &Path, path: String, branches: Vec<String>) -> Result<(), String> {
    let path = normalize_path(&path).ok_or_else(|| "path is required".to_string())?;
    let branches = normalize_branches(branches);
    let mut store = load(root)?;
    if store.entries.get(&path) == (!branches.is_empty()).then_some(&branches) {
        return Ok(());
    }
    if branches.is_empty() {
        store.entries.remove(&path);
    } else {
        store.entries.insert(path, branches);
    }
    save(root, &store)
}

pub fn rename_path(root: &Path, from: &str, to: &str) -> Result<(), String> {
    let from = normalize_path(from).ok_or_else(|| "path is required".to_string())?;
    let to = normalize_path(to).ok_or_else(|| "path is required".to_string())?;
    let mut store = load(root)?;
    let entries = std::mem::take(&mut store.entries);
    let mut changed = false;
    store.entries = entries
        .into_iter()
        .map(|(path, branches)| {
            let next = if path == from {
                Some(to.clone())
            } else {
                path.strip_prefix(&format!("{from}/"))
                    .map(|suffix| format!("{to}/{suffix}"))
            };
            if next.is_some() {
                changed = true;
            }
            (next.unwrap_or(path), branches)
        })
        .collect();
    if changed { save(root, &store) } else { Ok(()) }
}

pub fn delete_path(root: &Path, path: &str) -> Result<(), String> {
    let path = normalize_path(path).ok_or_else(|| "path is required".to_string())?;
    let mut store = load(root)?;
    let count = store.entries.len();
    store
        .entries
        .retain(|entry, _| entry != &path && !entry.starts_with(&format!("{path}/")));
    if store.entries.len() == count { Ok(()) } else { save(root, &store) }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_collapse_state_get(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    path: String,
) -> Result<Vec<String>, String> {
    let root = state.root_for_window(&window)?;
    let mutex = state.list_collapse_state_mutex();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = mutex.lock().map_err(|_| "list collapse state mutex poisoned".to_string())?;
        branches_for(&root, &path)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_collapse_state_set(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    path: String,
    branches: Vec<String>,
) -> Result<(), String> {
    let root = state.root_for_window(&window)?;
    let mutex = state.list_collapse_state_mutex();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = mutex.lock().map_err(|_| "list collapse state mutex poisoned".to_string())?;
        set_branches(&root, path, branches)
    })
    .await
    .map_err(|error| error.to_string())?
}
