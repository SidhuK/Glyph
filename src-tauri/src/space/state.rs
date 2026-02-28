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

pub struct SpaceState {
    pub(crate) current: Mutex<Option<PathBuf>>,
    pub(crate) notes_watcher: Mutex<Option<notify::RecommendedWatcher>>,
    recent_local_changes: RecentLocalChanges,
}

impl Default for SpaceState {
    fn default() -> Self {
        Self {
            current: Mutex::new(None),
            notes_watcher: Mutex::new(None),
            recent_local_changes: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl SpaceState {
    pub(crate) fn recent_local_changes(&self) -> RecentLocalChanges {
        Arc::clone(&self.recent_local_changes)
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
