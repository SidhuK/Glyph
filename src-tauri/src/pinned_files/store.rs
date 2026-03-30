use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::glyph_paths::ensure_glyph_dir;
use crate::io_atomic;
use crate::paths;
use crate::space_fs::helpers::deny_hidden_rel_path;

use super::types::PinnedFilesStore;

const PINNED_FILES_STORE_FILE: &str = "pinned_files.json";
const PINNED_FILES_STORE_VERSION: u32 = 1;

fn store_path(space_root: &Path) -> Result<PathBuf, String> {
    Ok(ensure_glyph_dir(space_root)?.join(PINNED_FILES_STORE_FILE))
}

fn default_store() -> PinnedFilesStore {
    PinnedFilesStore {
        version: PINNED_FILES_STORE_VERSION,
        files: Vec::new(),
    }
}

fn normalize_rel_path(path: &str) -> Option<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return None;
    }

    let rel = PathBuf::from(trimmed);
    if rel.as_os_str().is_empty() || deny_hidden_rel_path(&rel).is_err() {
        return None;
    }

    let normalized = rel
        .components()
        .filter_map(|component| component.as_os_str().to_str())
        .collect::<Vec<_>>()
        .join("/");

    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn normalize_files(space_root: &Path, files: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut next = Vec::new();

    for file in files {
        let Some(normalized) = normalize_rel_path(&file) else {
            continue;
        };
        if !seen.insert(normalized.clone()) {
            continue;
        }
        let Ok(abs) = paths::join_under(space_root, Path::new(&normalized)) else {
            continue;
        };
        if !abs.is_file() {
            continue;
        }
        next.push(normalized);
    }

    next
}

pub fn normalize_store(
    space_root: &Path,
    mut store: PinnedFilesStore,
) -> (PinnedFilesStore, bool) {
    let previous_version = store.version;
    let previous_files = std::mem::take(&mut store.files);
    let normalized_files = normalize_files(space_root, previous_files.clone());
    let changed = previous_version != PINNED_FILES_STORE_VERSION || previous_files != normalized_files;
    store.version = PINNED_FILES_STORE_VERSION;
    store.files = normalized_files;
    (store, changed)
}

pub fn load_store(space_root: &Path) -> Result<(PinnedFilesStore, bool), String> {
    let path = store_path(space_root)?;
    match std::fs::read(&path) {
        Ok(bytes) => {
            let store: PinnedFilesStore =
                serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
            if store.version > PINNED_FILES_STORE_VERSION {
                return Err(format!(
                    "unsupported pinned files store version {} (max supported {})",
                    store.version, PINNED_FILES_STORE_VERSION
                ));
            }
            Ok(normalize_store(space_root, store))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok((default_store(), false)),
        Err(error) => Err(error.to_string()),
    }
}

pub fn save_store(space_root: &Path, store: &PinnedFilesStore) -> Result<(), String> {
    let path = store_path(space_root)?;
    let bytes = serde_json::to_vec_pretty(store).map_err(|error| error.to_string())?;
    io_atomic::write_atomic(&path, &bytes).map_err(|error| error.to_string())
}

pub fn toggle_file(store: &mut PinnedFilesStore, path: &str) -> Result<(), String> {
    let normalized =
        normalize_rel_path(path).ok_or_else(|| "path is required".to_string())?;
    if let Some(index) = store.files.iter().position(|file| file == &normalized) {
        store.files.remove(index);
        return Ok(());
    }
    store.files.insert(0, normalized);
    Ok(())
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

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{
        load_store, rewrite_entry_path, save_store, should_remove_entry, toggle_file,
    };
    use crate::glyph_paths::ensure_glyph_dir;
    use crate::paths;
    use crate::pinned_files::types::PinnedFilesStore;

    fn unique_temp_dir() -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock before unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("glyph-pinned-files-{nanos}"));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn create_file(root: &Path, rel_path: &str) {
        let abs = paths::join_under(root, Path::new(rel_path)).expect("join path");
        if let Some(parent) = abs.parent() {
            fs::create_dir_all(parent).expect("create parent dir");
        }
        fs::write(abs, "hello").expect("write file");
    }

    #[test]
    fn load_missing_store_returns_empty() {
        let root = unique_temp_dir();
        let (store, changed) = load_store(&root).expect("load store");
        assert_eq!(store.version, 1);
        assert!(store.files.is_empty());
        assert!(!changed);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn load_store_prunes_invalid_duplicate_and_missing_paths() {
        let root = unique_temp_dir();
        create_file(&root, "notes/a.md");
        create_file(&root, "notes/b.md");
        let glyph_dir = ensure_glyph_dir(&root).expect("glyph dir");
        let store = PinnedFilesStore {
            version: 1,
            files: vec![
                "".to_string(),
                "notes/a.md".to_string(),
                "notes/a.md".to_string(),
                ".glyph/secret.md".to_string(),
                "notes/missing.md".to_string(),
                "notes/b.md".to_string(),
            ],
        };
        let bytes = serde_json::to_vec_pretty(&store).expect("serialize store");
        fs::write(glyph_dir.join("pinned_files.json"), bytes).expect("write store");

        let (loaded, changed) = load_store(&root).expect("load store");
        assert!(changed);
        assert_eq!(loaded.version, 1);
        assert_eq!(
            loaded.files,
            vec!["notes/a.md".to_string(), "notes/b.md".to_string()]
        );
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn toggle_adds_and_removes_in_recency_order() {
        let mut store = PinnedFilesStore {
            version: 1,
            files: vec!["notes/a.md".to_string()],
        };

        toggle_file(&mut store, "notes/b.md").expect("add file");
        assert_eq!(
            store.files,
            vec!["notes/b.md".to_string(), "notes/a.md".to_string()]
        );

        toggle_file(&mut store, "notes/b.md").expect("remove file");
        assert_eq!(store.files, vec!["notes/a.md".to_string()]);
    }

    #[test]
    fn rewrite_updates_exact_matches_and_descendants() {
        assert_eq!(
            rewrite_entry_path("notes/a.md", "notes/a.md", "archive/a.md"),
            Some("archive/a.md".to_string())
        );
        assert_eq!(
            rewrite_entry_path(
                "notes/folder/a.md",
                "notes/folder",
                "archive/folder"
            ),
            Some("archive/folder/a.md".to_string())
        );
        assert_eq!(rewrite_entry_path("notes/a.md", "notes/b.md", "archive/b.md"), None);
    }

    #[test]
    fn delete_removes_exact_matches_and_descendants() {
        assert!(should_remove_entry("notes/a.md", "notes/a.md"));
        assert!(should_remove_entry("notes/folder/a.md", "notes/folder"));
        assert!(!should_remove_entry("notes/a.md", "archive"));
    }

    #[test]
    fn save_and_reload_prunes_missing_files() {
        let root = unique_temp_dir();
        create_file(&root, "notes/a.md");
        let mut store = PinnedFilesStore {
            version: 1,
            files: vec!["notes/a.md".to_string(), "notes/missing.md".to_string()],
        };
        save_store(&root, &store).expect("save store");

        fs::remove_file(root.join("notes/a.md")).expect("remove file");
        store.files.clear();

        let (loaded, changed) = load_store(&root).expect("reload store");
        assert!(changed);
        assert!(loaded.files.is_empty());
        fs::remove_dir_all(root).ok();
    }
}
