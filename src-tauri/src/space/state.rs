use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

const RECENT_LOCAL_CHANGE_TTL: Duration = Duration::from_secs(2);

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
    pub(crate) root: PathBuf,
    pub(crate) _notes_watcher: Option<notify::RecommendedWatcher>,
    pub(crate) recent_local_changes: RecentLocalChanges,
}

impl SpaceSession {
    fn new(
        root: PathBuf,
        notes_watcher: notify::RecommendedWatcher,
        recent_local_changes: RecentLocalChanges,
    ) -> Self {
        Self {
            root,
            _notes_watcher: Some(notes_watcher),
            recent_local_changes,
        }
    }
}

pub struct SpaceState {
    pub(crate) current: Mutex<Option<PathBuf>>,
    pub(crate) sessions: Mutex<HashMap<String, SpaceSession>>,
    recent_local_changes: RecentLocalChanges,
    db_store_mutex: Arc<Mutex<()>>,
    file_tree_appearance_mutex: Arc<Mutex<()>>,
    pinned_files_mutex: Arc<Mutex<()>>,
}

impl Default for SpaceState {
    fn default() -> Self {
        Self {
            current: Mutex::new(None),
            sessions: Mutex::new(HashMap::new()),
            recent_local_changes: Arc::new(Mutex::new(HashMap::new())),
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

    pub(crate) fn recent_local_changes_for_window(&self, window_label: &str) -> RecentLocalChanges {
        self.sessions
            .lock()
            .ok()
            .and_then(|sessions| {
                sessions
                    .get(window_label)
                    .map(|session| Arc::clone(&session.recent_local_changes))
            })
            .unwrap_or_else(|| Arc::clone(&self.recent_local_changes))
    }

    pub(crate) fn set_window_session(
        &self,
        window_label: String,
        root: PathBuf,
        notes_watcher: notify::RecommendedWatcher,
        recent_local_changes: RecentLocalChanges,
    ) -> Result<(), String> {
        self.sessions
            .lock()
            .map_err(|_| "space sessions state poisoned".to_string())?
            .insert(
                window_label,
                SpaceSession::new(root.clone(), notes_watcher, recent_local_changes),
            );
        let mut current = self
            .current
            .lock()
            .map_err(|_| "space state poisoned".to_string())?;
        *current = Some(root);
        Ok(())
    }

    pub(crate) fn remove_window_session(&self, window_label: &str) -> Result<(), String> {
        let next_current = {
            let mut sessions = self
                .sessions
                .lock()
                .map_err(|_| "space sessions state poisoned".to_string())?;
            sessions.remove(window_label);
            sessions.values().next().map(|session| session.root.clone())
        };
        let mut current = self
            .current
            .lock()
            .map_err(|_| "space state poisoned".to_string())?;
        *current = next_current;
        Ok(())
    }

    pub(crate) fn root_for_window_label(&self, window_label: &str) -> Result<PathBuf, String> {
        if let Some(root) = self
            .sessions
            .lock()
            .map_err(|_| "space sessions state poisoned".to_string())?
            .get(window_label)
            .map(|session| session.root.clone())
        {
            return Ok(root);
        }
        self.current_root()
    }

    pub fn root_for_window(&self, window: &tauri::WebviewWindow) -> Result<PathBuf, String> {
        self.root_for_window_label(window.label())
    }

    pub(crate) fn session_roots(&self) -> Vec<PathBuf> {
        self.sessions
            .lock()
            .map(|sessions| {
                sessions
                    .values()
                    .map(|session| session.root.clone())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
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
