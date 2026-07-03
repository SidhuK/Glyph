use crate::{glyph_paths, io_atomic, paths as safe_paths, utils};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Manager};

const SPACES_MANIFEST_FILE: &str = "spaces.json";
const MANIFEST_VERSION: u32 = 1;
const GLYPH_DB_WAL_NAME: &str = "glyph.sqlite-wal";
const GLYPH_DB_SHM_NAME: &str = "glyph.sqlite-shm";

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
static MANIFEST_MUTEX: Mutex<()> = Mutex::new(());
#[cfg(test)]
static TEST_INDEX_ROOT_MUTEX: Mutex<()> = Mutex::new(());

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

pub fn index_root_path() -> Result<PathBuf, String> {
    INDEX_ROOT
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
        .ok_or_else(|| "index root is not initialized".to_string())
}

fn manifest_path() -> Result<PathBuf, String> {
    Ok(index_root_path()?.join(SPACES_MANIFEST_FILE))
}

fn manifest_lock() -> MutexGuard<'static, ()> {
    MANIFEST_MUTEX
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn load_manifest_unlocked() -> Result<SpacesManifest, String> {
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

fn save_manifest_unlocked(manifest: &mut SpacesManifest) -> Result<(), String> {
    manifest.version = MANIFEST_VERSION;
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
    let key_taken = |candidate: &str| {
        manifest
            .spaces
            .iter()
            .any(|(path, entry)| path != &root_key && entry.key == candidate)
    };
    let base_taken = key_taken(&base);
    let hash = short_path_hash(root);
    let fallback_base = format!("{base}-{hash}");
    let fallback_taken = key_taken(&fallback_base);
    if !base_taken && !fallback_taken {
        return base;
    }

    let mut candidate = fallback_base;
    let mut suffix = 2;
    while key_taken(&candidate) {
        candidate = format!("{base}-{hash}-{suffix}");
        suffix += 1;
    }
    candidate
}

pub fn register_space(canonical_root: &Path) -> Result<String, String> {
    let root_key = canonical_root_key(canonical_root);
    let _guard = manifest_lock();

    let mut manifest = load_manifest_unlocked()?;
    if let Some(entry) = manifest.spaces.get(&root_key) {
        return Ok(entry.key.clone());
    }

    let key = resolve_unique_key(&manifest, canonical_root);
    manifest.spaces.insert(
        root_key.clone(),
        SpaceManifestEntry {
            key: key.clone(),
        },
    );
    save_manifest_unlocked(&mut manifest)?;
    ensure_index_glyph_dir(&key)?;
    tracing::info!(
        space_root = %root_key,
        index_key = %key,
        "Registered space in app-support index manifest"
    );
    Ok(key)
}

#[cfg(test)]
pub(crate) fn space_index_key(canonical_root: &Path) -> Result<String, String> {
    let root_key = canonical_root_key(canonical_root);
    let _guard = manifest_lock();
    let manifest = load_manifest_unlocked()?;
    manifest
        .spaces
        .get(&root_key)
        .map(|entry| entry.key.clone())
        .ok_or_else(|| format!("space not registered in index manifest: {root_key}"))
}

fn index_glyph_dir(key: &str) -> Result<PathBuf, String> {
    let space_index_dir = safe_paths::join_under(&index_root_path()?, Path::new(key))?;
    Ok(space_index_dir.join(glyph_paths::GLYPH_DIR_NAME))
}

fn ensure_index_glyph_dir(key: &str) -> Result<PathBuf, String> {
    let dir = index_glyph_dir(key)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[cfg(test)]
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
    let mut removed = 0usize;
    for name in [
        glyph_paths::GLYPH_DB_NAME,
        GLYPH_DB_WAL_NAME,
        GLYPH_DB_SHM_NAME,
    ] {
        let path = glyph_dir.join(name);
        if path.exists() && std::fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    if removed > 0 {
        tracing::info!(
            space_root = %space_root.to_string_lossy(),
            removed,
            "Removed stale in-space SQLite index files"
        );
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
pub(crate) fn test_index_root_lock() -> MutexGuard<'static, ()> {
    TEST_INDEX_ROOT_MUTEX
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
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
        let _guard = test_index_root_lock();
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
        for name in [glyph_paths::GLYPH_DB_NAME, GLYPH_DB_WAL_NAME, GLYPH_DB_SHM_NAME] {
            std::fs::write(glyph_dir.join(name), b"x").expect("sqlite file should be written");
        }

        remove_stale_in_space_db(&space_root);

        assert!(!glyph_dir.join(glyph_paths::GLYPH_DB_NAME).exists());
        assert!(!glyph_dir.join(GLYPH_DB_WAL_NAME).exists());
        assert!(!glyph_dir.join(GLYPH_DB_SHM_NAME).exists());
        assert!(marker.exists());

        let _ = std::fs::remove_dir_all(space_root);
    }
}
