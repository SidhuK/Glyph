use std::{path::PathBuf, sync::Mutex};

pub struct SpaceState {
    pub(crate) current: Mutex<Option<PathBuf>>,
    pub(crate) notes_watcher: Mutex<Option<notify::RecommendedWatcher>>,
}

impl Default for SpaceState {
    fn default() -> Self {
        Self {
            current: Mutex::new(None),
            notes_watcher: Mutex::new(None),
        }
    }
}

impl SpaceState {
    pub fn current_root(&self) -> Result<PathBuf, String> {
        let guard = self
            .current
            .lock()
            .map_err(|_| "space state poisoned".to_string())?;
        guard
            .clone()
            .ok_or_else(|| "no space open (select or create a space first)".to_string())
    }
}
