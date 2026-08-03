use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use crate::window_geometry;

const RECENT_LOCAL_CHANGE_TTL: Duration = Duration::from_secs(2);
pub(crate) const NO_SPACE_SESSION_FOR_WINDOW: &str = "no space session for window";

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
    pub(crate) sessions: Mutex<HashMap<String, SpaceSession>>,
    db_store_mutex: Arc<Mutex<()>>,
    file_tree_appearance_mutex: Arc<Mutex<()>>,
    list_collapse_state_mutex: Arc<Mutex<()>>,
    note_mutation_mutex: Arc<Mutex<()>>,
    pinned_files_mutex: Arc<Mutex<()>>,
}

impl Default for SpaceState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            db_store_mutex: Arc::new(Mutex::new(())),
            file_tree_appearance_mutex: Arc::new(Mutex::new(())),
            list_collapse_state_mutex: Arc::new(Mutex::new(())),
            note_mutation_mutex: Arc::new(Mutex::new(())),
            pinned_files_mutex: Arc::new(Mutex::new(())),
        }
    }
}

impl SpaceState {
    pub(crate) fn new_recent_local_changes(&self) -> RecentLocalChanges {
        Arc::new(Mutex::new(HashMap::new()))
    }

    pub(crate) fn recent_local_changes_for_window(&self, window_label: &str) -> RecentLocalChanges {
        let Ok(sessions) = self.sessions.lock() else {
            return Arc::new(Mutex::new(HashMap::new()));
        };
        if let Some(session) = sessions.get(window_label) {
            return Arc::clone(&session.recent_local_changes);
        }
        if let Some(session) = sessions.get(window_geometry::MAIN_WINDOW_LABEL) {
            return Arc::clone(&session.recent_local_changes);
        }
        Arc::new(Mutex::new(HashMap::new()))
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
                SpaceSession::new(root, notes_watcher, recent_local_changes),
            );
        Ok(())
    }

    pub(crate) fn remove_window_session(&self, window_label: &str) -> Result<(), String> {
        self.sessions
            .lock()
            .map_err(|_| "space sessions state poisoned".to_string())?
            .remove(window_label);
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
        Err(format!("{NO_SPACE_SESSION_FOR_WINDOW}: {window_label}"))
    }

    pub fn root_for_window(&self, window: &tauri::WebviewWindow) -> Result<PathBuf, String> {
        match self.root_for_window_label(window.label()) {
            Ok(root) => Ok(root),
            Err(error)
                if is_no_space_session_error(&error)
                    && shares_main_space_session(window.label()) =>
            {
                // Auxiliary editor windows (quick note, external markdown, …)
                // inherit the main window's active space rather than owning one.
                self.root_for_window_label(window_geometry::MAIN_WINDOW_LABEL)
            }
            Err(error) => Err(error),
        }
    }

    pub(crate) fn db_store_mutex(&self) -> Arc<Mutex<()>> {
        Arc::clone(&self.db_store_mutex)
    }

    pub(crate) fn file_tree_appearance_mutex(&self) -> Arc<Mutex<()>> {
        Arc::clone(&self.file_tree_appearance_mutex)
    }

    pub(crate) fn list_collapse_state_mutex(&self) -> Arc<Mutex<()>> {
        Arc::clone(&self.list_collapse_state_mutex)
    }

    pub(crate) fn note_mutation_mutex(&self) -> Arc<Mutex<()>> {
        Arc::clone(&self.note_mutation_mutex)
    }

    pub(crate) fn pinned_files_mutex(&self) -> Arc<Mutex<()>> {
        Arc::clone(&self.pinned_files_mutex)
    }
}

pub(crate) fn is_no_space_session_error(error: &str) -> bool {
    error.starts_with(NO_SPACE_SESSION_FOR_WINDOW)
}

/// Windows that edit notes against the main space without a private session.
fn shares_main_space_session(window_label: &str) -> bool {
    matches!(window_label, "quick-note" | "quick-task")
        || window_label.starts_with("external-markdown-")
}
