use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

use crate::{
    glyph_paths::{ensure_glyph_dir, glyph_dir},
    io_atomic,
    space_fs::helpers::deny_hidden_rel_path,
};

use super::types::ListCollapseStateStore;

const LIST_COLLAPSE_STATE_STORE_FILE: &str = "list_collapse_state.json";
const LIST_COLLAPSE_STATE_STORE_VERSION: u32 = 1;

fn read_path(space_root: &Path) -> Result<PathBuf, String> {
    Ok(glyph_dir(space_root)?.join(LIST_COLLAPSE_STATE_STORE_FILE))
}

fn store_path(space_root: &Path) -> Result<PathBuf, String> {
    Ok(ensure_glyph_dir(space_root)?.join(LIST_COLLAPSE_STATE_STORE_FILE))
}

fn default_store() -> ListCollapseStateStore {
    ListCollapseStateStore {
        version: LIST_COLLAPSE_STATE_STORE_VERSION,
        entries: BTreeMap::new(),
    }
}

fn normalize_branch_keys(branches: Vec<String>) -> Vec<String> {
    let mut branches = branches
        .into_iter()
        .filter_map(|branch| {
            let branch = branch.trim().to_string();
            (!branch.is_empty() && branch.len() <= 512).then_some(branch)
        })
        .collect::<Vec<_>>();
    branches.sort();
    branches.dedup();
    branches
}

pub fn normalize_path(path: &str) -> Option<String> {
    let rel = PathBuf::from(path.trim());
    if rel.as_os_str().is_empty() || rel.is_absolute() || deny_hidden_rel_path(&rel).is_err() {
        return None;
    }
    let path = rel
        .components()
        .filter_map(|component| match component {
            std::path::Component::Normal(component) => component.to_str(),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/");
    (!path.is_empty()).then_some(path)
}

pub fn load_store(space_root: &Path) -> Result<ListCollapseStateStore, String> {
    let path = read_path(space_root)?;
    match std::fs::read(&path) {
        Ok(bytes) => {
            let Ok(mut store) = serde_json::from_slice::<ListCollapseStateStore>(&bytes) else {
                tracing::warn!(path = %path.display(), "invalid list collapse state store; ignoring it");
                return Ok(default_store());
            };
            if store.version > LIST_COLLAPSE_STATE_STORE_VERSION {
                return Err(format!(
                    "unsupported list collapse state store version {} (max supported {})",
                    store.version, LIST_COLLAPSE_STATE_STORE_VERSION
                ));
            }
            store.version = LIST_COLLAPSE_STATE_STORE_VERSION;
            store.entries = store
                .entries
                .into_iter()
                .filter_map(|(path, branches)| {
                    let path = normalize_path(&path)?;
                    let branches = normalize_branch_keys(branches);
                    (!branches.is_empty()).then_some((path, branches))
                })
                .collect();
            Ok(store)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(default_store()),
        Err(error) => Err(error.to_string()),
    }
}

fn save_store(space_root: &Path, store: &ListCollapseStateStore) -> Result<(), String> {
    let path = store_path(space_root)?;
    let bytes = serde_json::to_vec_pretty(store).map_err(|error| error.to_string())?;
    io_atomic::write_atomic(&path, &bytes).map_err(|error| error.to_string())
}

pub fn branches_for_path(space_root: &Path, path: &str) -> Result<Vec<String>, String> {
    let path = normalize_path(path).ok_or_else(|| "path is required".to_string())?;
    Ok(load_store(space_root)?
        .entries
        .get(&path)
        .cloned()
        .unwrap_or_default())
}

pub fn set_branches_for_path(
    space_root: &Path,
    path: String,
    branches: Vec<String>,
) -> Result<(), String> {
    let mut store = load_store(space_root)?;
    let path = normalize_path(&path).ok_or_else(|| "path is required".to_string())?;
    let branches = normalize_branch_keys(branches);
    if store.entries.get(&path) == (!branches.is_empty()).then_some(&branches) {
        return Ok(());
    }
    if branches.is_empty() {
        store.entries.remove(&path);
    } else {
        store.entries.insert(path, branches);
    }
    save_store(space_root, &store)
}

pub fn rename_path(space_root: &Path, from_path: &str, to_path: &str) -> Result<(), String> {
    let from_path = normalize_path(from_path).ok_or_else(|| "path is required".to_string())?;
    let to_path = normalize_path(to_path).ok_or_else(|| "path is required".to_string())?;
    let mut store = load_store(space_root)?;
    let entries = std::mem::take(&mut store.entries);
    let mut changed = false;
    store.entries = entries
        .into_iter()
        .map(|(path, branches)| {
            let path = match rewrite_entry_path(&path, &from_path, &to_path) {
                Some(path) => {
                    changed = true;
                    path
                }
                None => path,
            };
            (path, branches)
        })
        .collect();
    if !changed {
        Ok(())
    } else {
        save_store(space_root, &store)
    }
}

pub fn delete_path(space_root: &Path, path: &str) -> Result<(), String> {
    let path = normalize_path(path).ok_or_else(|| "path is required".to_string())?;
    let mut store = load_store(space_root)?;
    let entry_count = store.entries.len();
    store
        .entries
        .retain(|entry_path, _| !should_remove_entry(entry_path, &path));
    if store.entries.len() == entry_count {
        Ok(())
    } else {
        save_store(space_root, &store)
    }
}

fn rewrite_entry_path(path: &str, from_path: &str, to_path: &str) -> Option<String> {
    if path == from_path {
        return Some(to_path.to_string());
    }
    path.strip_prefix(&format!("{from_path}/"))
        .map(|suffix| format!("{to_path}/{suffix}"))
}

fn should_remove_entry(path: &str, target_path: &str) -> bool {
    path == target_path || path.starts_with(&format!("{target_path}/"))
}
