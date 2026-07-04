use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

const RECENT_LOCAL_CHANGE_TTL: Duration = Duration::from_secs(2);
const NO_SPACE_OPEN: &str = "no space open";

pub(crate) type RecentLocalChanges = Arc<Mutex<HashMap<String, Instant>>>;

fn normalize_rel_path(rel_path: &str) -> Option<String> {
    let normalized = Path::new(rel_path)
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

fn prune_expired(entries: &mut HashMap<String, Instant>, now: Instant) {
    entries.retain(|_, timestamp| now.duration_since(*timestamp) < RECENT_LOCAL_CHANGE_TTL);
}

pub(crate) fn mark_recent_local_change(changes: &RecentLocalChanges, rel_path: &str) {
    let Some(normalized) = normalize_rel_path(rel_path) else {
        return;
    };
    let now = Instant::now();
    let mut guard = changes
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    prune_expired(&mut guard, now);
    guard.insert(normalized, now);
}

pub(crate) fn has_recent_local_change(changes: &RecentLocalChanges, rel_path: &str) -> bool {
    let Some(normalized) = normalize_rel_path(rel_path) else {
        return false;
    };
    let now = Instant::now();
    let mut guard = changes
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    prune_expired(&mut guard, now);
    guard.contains_key(&normalized)
}

pub(crate) struct SpaceSession {
    pub(crate) _notes_watcher: Option<notify::RecommendedWatcher>,
    pub(crate) recent_local_changes: RecentLocalChanges,
}

impl SpaceSession {
    fn new(
        notes_watcher: notify::RecommendedWatcher,
        recent_local_changes: RecentLocalChanges,
    ) -> Self {
        Self {
            _notes_watcher: Some(notes_watcher),
            recent_local_changes,
        }
    }
}

pub struct SpaceState {
    pub(crate) current: Mutex<Option<PathBuf>>,
    session: Mutex<Option<SpaceSession>>,
    db_store_mutex: Arc<Mutex<()>>,
    file_tree_appearance_mutex: Arc<Mutex<()>>,
    pinned_files_mutex: Arc<Mutex<()>>,
}

impl Default for SpaceState {
    fn default() -> Self {
        Self {
            current: Mutex::new(None),
            session: Mutex::new(None),
            db_store_mutex: Arc::new(Mutex::new(())),
            file_tree_appearance_mutex: Arc::new(Mutex::new(())),
            pinned_files_mutex: Arc::new(Mutex::new(())),
        }
    }
}

impl SpaceState {
    pub(crate) fn new_recent_local_changes(&self) -> RecentLocalChanges {
        Arc::new(Mutex::new(HashMap::new()))
    }

    pub(crate) fn recent_local_changes(&self) -> RecentLocalChanges {
        self.session
            .lock()
            .ok()
            .and_then(|guard| {
                guard
                    .as_ref()
                    .map(|session| Arc::clone(&session.recent_local_changes))
            })
            .unwrap_or_else(|| Arc::new(Mutex::new(HashMap::new())))
    }

    pub(crate) fn replace_session(
        &self,
        root: PathBuf,
        notes_watcher: notify::RecommendedWatcher,
        recent_local_changes: RecentLocalChanges,
    ) -> Result<(), String> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| "space state poisoned".to_string())?;
        *session = Some(SpaceSession::new(
            notes_watcher,
            recent_local_changes,
        ));
        let mut current = self
            .current
            .lock()
            .map_err(|_| "space state poisoned".to_string())?;
        *current = Some(root);
        Ok(())
    }

    pub(crate) fn clear_session(&self) -> Result<(), String> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| "space state poisoned".to_string())?;
        *session = None;
        let mut current = self
            .current
            .lock()
            .map_err(|_| "space state poisoned".to_string())?;
        *current = None;
        Ok(())
    }

    pub(crate) fn has_open_session(&self) -> bool {
        self.current
            .lock()
            .ok()
            .and_then(|guard| guard.clone())
            .is_some()
    }

    pub(crate) fn db_store_mutex(&self) -> Arc<Mutex<()>> {
        Arc::clone(&self.db_store_mutex)
    }

    pub(crate) fn file_tree_appearance_mutex(&self) -> Arc<Mutex<()>> {
        Arc::clone(&self.file_tree_appearance_mutex)
    }

    pub(crate) fn pinned_files_mutex(&self) -> Arc<Mutex<()>> {
        Arc::clone(&self.pinned_files_mutex)
    }

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

pub(crate) fn is_no_space_open_error(error: &str) -> bool {
    error.starts_with(NO_SPACE_OPEN)
}
