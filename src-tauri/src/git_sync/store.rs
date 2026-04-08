use std::path::{Path, PathBuf};

use crate::glyph_paths::ensure_glyph_dir;
use crate::io_atomic;

use super::types::{GitSyncConfig, GitSyncStore, GIT_SYNC_STORE_VERSION};

const GIT_SYNC_STORE_FILE: &str = "git_sync.json";

fn store_path(space_root: &Path) -> Result<PathBuf, String> {
    Ok(ensure_glyph_dir(space_root)?.join(GIT_SYNC_STORE_FILE))
}

pub fn load_store(space_root: &Path) -> Result<Option<GitSyncConfig>, String> {
    let path = store_path(space_root)?;
    match std::fs::read(&path) {
        Ok(bytes) => {
            let mut store: GitSyncStore =
                serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
            if store.version > GIT_SYNC_STORE_VERSION {
                return Err(format!(
                    "unsupported git sync store version {} (max supported {})",
                    store.version, GIT_SYNC_STORE_VERSION
                ));
            }
            store.version = GIT_SYNC_STORE_VERSION;
            Ok(Some(store.config))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub fn save_store(space_root: &Path, config: &GitSyncConfig) -> Result<(), String> {
    let path = store_path(space_root)?;
    let store = GitSyncStore {
        version: GIT_SYNC_STORE_VERSION,
        config: config.clone(),
    };
    let bytes = serde_json::to_vec_pretty(&store).map_err(|error| error.to_string())?;
    io_atomic::write_atomic(&path, &bytes).map_err(|error| error.to_string())
}

pub fn delete_store(space_root: &Path) -> Result<(), String> {
    let path = store_path(space_root)?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use crate::git_sync::types::{
        GitSyncConfig, GitSyncConflictPolicy, GitSyncRepoMode, GitSyncStore,
    };

    use super::{delete_store, load_store, save_store};

    fn temp_root() -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("glyph-git-sync-store-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).expect("create temp dir");
        root
    }

    #[test]
    fn round_trips_store() {
        let root = temp_root();
        let config = GitSyncConfig::with_remote(
            "https://github.com/team/repo".to_string(),
            "main".to_string(),
            GitSyncRepoMode::ManagedNewRepo,
        );
        save_store(&root, &config).expect("save store");

        let loaded = load_store(&root).expect("load store").expect("config");
        assert_eq!(loaded.remote_url, config.remote_url);
        assert_eq!(loaded.branch, config.branch);
        assert_eq!(loaded.conflict_policy, GitSyncConflictPolicy::LocalWins);
    }

    #[test]
    fn deletes_store() {
        let root = temp_root();
        let config = GitSyncConfig::with_remote(
            "https://github.com/team/repo".to_string(),
            "main".to_string(),
            GitSyncRepoMode::AdoptedExistingRepo,
        );
        save_store(&root, &config).expect("save store");
        delete_store(&root).expect("delete store");
        assert!(load_store(&root).expect("load store").is_none());
    }

    #[test]
    fn rejects_newer_store_version() {
        let root = temp_root();
        let store = GitSyncStore {
            version: 999,
            config: GitSyncConfig::with_remote(
                "https://github.com/team/repo".to_string(),
                "main".to_string(),
                GitSyncRepoMode::ManagedNewRepo,
            ),
        };
        let glyph_dir = root.join(".glyph");
        std::fs::create_dir_all(&glyph_dir).expect("glyph dir");
        let path = glyph_dir.join("git_sync.json");
        let bytes = serde_json::to_vec_pretty(&store).expect("serialize store");
        std::fs::write(path, bytes).expect("write store");

        let error = load_store(&root).expect_err("expected version error");
        assert!(error.contains("unsupported git sync store version"));
    }
}
