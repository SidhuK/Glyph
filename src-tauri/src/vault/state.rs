use std::{
    path::PathBuf,
    sync::Mutex,
};

pub struct VaultState {
    pub(crate) current: Mutex<Option<PathBuf>>,
    pub(crate) notes_watcher: Mutex<Option<notify::RecommendedWatcher>>,
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
        let guard = self
            .current
            .lock()
            .map_err(|_| "vault state poisoned".to_string())?;
        guard
            .clone()
            .ok_or_else(|| "no vault open (select or create a vault first)".to_string())
    }
}
