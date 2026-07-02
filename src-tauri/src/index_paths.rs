use crate::{glyph_paths, io_atomic, utils};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const SPACES_MANIFEST_FILE: &str = "spaces.json";
const MANIFEST_VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
struct SpaceManifestEntry {
    key: String,
}

#[derive(Serialize, Deserialize)]
struct SpacesManifest {
    version: u32,
    spaces: HashMap<String, SpaceManifestEntry>,
}

static INDEX_ROOT: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn init_index_root(app: &AppHandle) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let index_dir = config_dir.join("index");
    std::fs::create_dir_all(&index_dir).map_err(|e| e.to_string())?;
    let mut guard = INDEX_ROOT.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if guard.is_none() {
        *guard = Some(index_dir);
    }
    Ok(())
}

fn index_root_dir() -> Result<PathBuf, String> {
    INDEX_ROOT
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
        .ok_or_else(|| "index root is not initialized".to_string())
}

fn manifest_path() -> Result<PathBuf, String> {
    Ok(index_root_dir()?.join(SPACES_MANIFEST_FILE))
}

fn load_manifest() -> Result<SpacesManifest, String> {
    let path = manifest_path()?;
    match std::fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| e.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(SpacesManifest {
            version: MANIFEST_VERSION,
            spaces: HashMap::new(),
        }),
        Err(error) => Err(error.to_string()),
    }
}

fn save_manifest(manifest: &SpacesManifest) -> Result<(), String> {
    let path = manifest_path()?;
    let bytes = serde_json::to_vec_pretty(manifest).map_err(|e| e.to_string())?;
    io_atomic::write_atomic(&path, &bytes).map_err(|e| e.to_string())
}

fn canonical_root_key(root: &Path) -> String {
    root.to_string_lossy().to_string()
}

fn base_key_from_root(root: &Path) -> String {
    root.file_name()
        .and_then(|name| name.to_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(sanitize_index_key)
        .unwrap_or_else(|| "space".to_string())
}

fn sanitize_index_key(name: &str) -> String {
    let sanitized = name
        .chars()
        .map(|ch| {
            if ch.is_alphanumeric() || matches!(ch, ' ' | '-' | '_' | '.') {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim()
        .to_string();
    if sanitized.is_empty() {
        "space".to_string()
    } else {
        sanitized
    }
}

fn short_path_hash(root: &Path) -> String {
    let hash = utils::sha256_hex(root.to_string_lossy().as_bytes());
    hash[..8].to_string()
}

fn resolve_unique_key(manifest: &SpacesManifest, root: &Path) -> String {
    let base = base_key_from_root(root);
    let root_key = canonical_root_key(root);
    let base_taken = manifest.spaces.iter().any(|(path, entry)| {
        path != &root_key && entry.key == base
    });
    if !base_taken {
        return base;
    }
    format!("{}-{}", base, short_path_hash(root))
}

pub fn register_space(canonical_root: &Path) -> Result<String, String> {
    let root_key = canonical_root_key(canonical_root);
    let mut manifest = load_manifest()?;
    if let Some(entry) = manifest.spaces.get(&root_key) {
        return Ok(entry.key.clone());
    }

    let key = resolve_unique_key(&manifest, canonical_root);
    manifest.spaces.insert(
        root_key,
        SpaceManifestEntry {
            key: key.clone(),
        },
    );
    save_manifest(&manifest)?;
    ensure_index_glyph_dir(&key)?;
    Ok(key)
}

pub fn space_index_key(canonical_root: &Path) -> Result<String, String> {
    let root_key = canonical_root_key(canonical_root);
    let manifest = load_manifest()?;
    manifest
        .spaces
        .get(&root_key)
        .map(|entry| entry.key.clone())
        .ok_or_else(|| format!("space not registered in index manifest: {root_key}"))
}

fn index_glyph_dir(key: &str) -> Result<PathBuf, String> {
    Ok(index_root_dir()?
        .join(key)
        .join(glyph_paths::GLYPH_DIR_NAME))
}

fn ensure_index_glyph_dir(key: &str) -> Result<PathBuf, String> {
    let dir = index_glyph_dir(key)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn index_db_path(canonical_root: &Path) -> Result<PathBuf, String> {
    let key = space_index_key(canonical_root)?;
    Ok(index_glyph_dir(&key)?.join(glyph_paths::GLYPH_DB_NAME))
}

pub fn ensure_index_dir(canonical_root: &Path) -> Result<PathBuf, String> {
    let key = register_space(canonical_root)?;
    ensure_index_glyph_dir(&key)
}

pub fn remove_stale_in_space_db(space_root: &Path) {
    let Ok(glyph_dir) = glyph_paths::glyph_dir(space_root) else {
        return;
    };
    for name in [
        glyph_paths::GLYPH_DB_NAME,
        &format!("{}-wal", glyph_paths::GLYPH_DB_NAME),
        &format!("{}-shm", glyph_paths::GLYPH_DB_NAME),
    ] {
        let _ = std::fs::remove_file(glyph_dir.join(name));
    }
}

#[cfg(test)]
pub(crate) fn init_test_index_root(path: PathBuf) {
    std::fs::create_dir_all(&path).ok();
    *INDEX_ROOT
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(path);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_index_root() -> PathBuf {
        let id = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!("glyph-index-paths-test-{id}"))
    }

    #[test]
    fn assigns_unique_keys_for_same_folder_name() {
        let index_root = temp_index_root();
        init_test_index_root(index_root.clone());

        let notes_a = temp_index_root().join("Notes");
        let notes_b = temp_index_root().join("Notes");
        std::fs::create_dir_all(&notes_a).expect("first notes dir should exist");
        std::fs::create_dir_all(&notes_b).expect("second notes dir should exist");

        let key_a = register_space(&notes_a).expect("first space should register");
        let key_b = register_space(&notes_b).expect("second space should register");

        assert_eq!(key_a, "Notes");
        assert_ne!(key_a, key_b);
        assert!(key_b.starts_with("Notes-"));

        let db_a = index_db_path(&notes_a).expect("first db path should resolve");
        let db_b = index_db_path(&notes_b).expect("second db path should resolve");
        assert_ne!(db_a, db_b);
        assert!(db_a.starts_with(&index_root));
        assert!(db_b.starts_with(&index_root));

        let _ = std::fs::remove_dir_all(index_root);
        let _ = std::fs::remove_dir_all(notes_a);
        let _ = std::fs::remove_dir_all(notes_b);
    }

    #[test]
    fn remove_stale_in_space_db_deletes_only_sqlite_sidecars() {
        let space_root = temp_index_root().join("space");
        let glyph_dir = glyph_paths::ensure_glyph_dir(&space_root).expect("glyph dir should exist");
        let marker = glyph_dir.join("onboarding-note-v2.json");
        std::fs::write(&marker, b"{}").expect("marker should be written");
        for name in ["glyph.sqlite", "glyph.sqlite-wal", "glyph.sqlite-shm"] {
            std::fs::write(glyph_dir.join(name), b"x").expect("sqlite file should be written");
        }

        remove_stale_in_space_db(&space_root);

        assert!(!glyph_dir.join("glyph.sqlite").exists());
        assert!(!glyph_dir.join("glyph.sqlite-wal").exists());
        assert!(!glyph_dir.join("glyph.sqlite-shm").exists());
        assert!(marker.exists());

        let _ = std::fs::remove_dir_all(space_root);
    }
}
