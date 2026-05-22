use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::glyph_paths::ensure_glyph_dir;
use crate::index::tags::normalize_tag;
use crate::io_atomic;

use super::types::{TagAppearance, TagAppearanceStore};

const TAG_APPEARANCE_STORE_FILE: &str = "tag_appearance.json";
const TAG_APPEARANCE_STORE_VERSION: u32 = 1;

fn store_path(space_root: &Path) -> Result<PathBuf, String> {
    Ok(ensure_glyph_dir(space_root)?.join(TAG_APPEARANCE_STORE_FILE))
}

fn default_store() -> TagAppearanceStore {
    TagAppearanceStore {
        version: TAG_APPEARANCE_STORE_VERSION,
        entries: BTreeMap::new(),
    }
}

pub fn normalize_store(mut store: TagAppearanceStore) -> TagAppearanceStore {
    store.version = TAG_APPEARANCE_STORE_VERSION;
    store.entries = store
        .entries
        .into_iter()
        .filter_map(|(tag, appearance)| {
            let tag = normalize_tag(&tag)?;
            let appearance = appearance.normalized()?;
            Some((tag, appearance))
        })
        .collect();
    store
}

pub fn load_store(space_root: &Path) -> Result<TagAppearanceStore, String> {
    let path = store_path(space_root)?;
    match std::fs::read(&path) {
        Ok(bytes) => {
            let store: TagAppearanceStore =
                serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
            if store.version > TAG_APPEARANCE_STORE_VERSION {
                return Err(format!(
                    "unsupported tag appearance store version {} (max supported {})",
                    store.version, TAG_APPEARANCE_STORE_VERSION
                ));
            }
            Ok(normalize_store(store))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(default_store()),
        Err(error) => Err(error.to_string()),
    }
}

pub fn save_store(space_root: &Path, store: &TagAppearanceStore) -> Result<(), String> {
    let path = store_path(space_root)?;
    let store = normalize_store(store.clone());
    let bytes = serde_json::to_vec_pretty(&store).map_err(|error| error.to_string())?;
    io_atomic::write_atomic(&path, &bytes).map_err(|error| error.to_string())
}

pub fn normalize_tag_key(tag: &str) -> Result<String, String> {
    normalize_tag(tag).ok_or_else(|| "invalid tag".to_string())
}

pub fn normalize_appearance(icon: Option<String>) -> Option<TagAppearance> {
    TagAppearance { icon }.normalized()
}
