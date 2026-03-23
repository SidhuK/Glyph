use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::glyph_paths::ensure_glyph_dir;
use crate::io_atomic;

use super::types::FileTreeAppearanceStore;

const FILE_TREE_APPEARANCE_STORE_FILE: &str = "file_tree_appearance.json";
const FILE_TREE_APPEARANCE_STORE_VERSION: u32 = 1;

fn store_path(space_root: &Path) -> Result<PathBuf, String> {
    Ok(ensure_glyph_dir(space_root)?.join(FILE_TREE_APPEARANCE_STORE_FILE))
}

fn default_store() -> FileTreeAppearanceStore {
    FileTreeAppearanceStore {
        version: FILE_TREE_APPEARANCE_STORE_VERSION,
        entries: BTreeMap::new(),
    }
}

pub fn load_store(space_root: &Path) -> Result<FileTreeAppearanceStore, String> {
    let path = store_path(space_root)?;
    match std::fs::read(&path) {
        Ok(bytes) => {
            let mut store: FileTreeAppearanceStore =
                serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
            if store.version > FILE_TREE_APPEARANCE_STORE_VERSION {
                return Err(format!(
                    "unsupported file tree appearance store version {} (max supported {})",
                    store.version, FILE_TREE_APPEARANCE_STORE_VERSION
                ));
            }
            store.version = FILE_TREE_APPEARANCE_STORE_VERSION;
            store.entries = store
                .entries
                .into_iter()
                .filter_map(|(path, appearance)| appearance.normalized().map(|item| (path, item)))
                .collect();
            Ok(store)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(default_store()),
        Err(error) => Err(error.to_string()),
    }
}

pub fn save_store(space_root: &Path, store: &FileTreeAppearanceStore) -> Result<(), String> {
    let path = store_path(space_root)?;
    let bytes = serde_json::to_vec_pretty(store).map_err(|error| error.to_string())?;
    io_atomic::write_atomic(&path, &bytes).map_err(|error| error.to_string())
}

pub fn rewrite_entry_path(path: &str, from_path: &str, to_path: &str) -> Option<String> {
    if path == from_path {
        return Some(to_path.to_string());
    }
    let prefix = format!("{from_path}/");
    path.strip_prefix(&prefix)
        .map(|suffix| format!("{to_path}/{suffix}"))
}

pub fn should_remove_entry(path: &str, target_path: &str) -> bool {
    path == target_path || path.starts_with(&format!("{target_path}/"))
}
