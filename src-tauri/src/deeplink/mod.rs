//! `glyph://` deeplink parse, validation, queue, and dispatch to the app shell.

mod parse;

pub use parse::{parse_deeplink_url, DeeplinkAction, DeeplinkError};

use serde::Serialize;
use std::collections::VecDeque;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tracing::warn;

use crate::window_geometry::MAIN_WINDOW_LABEL;

const DEEPLINK_ACTION_EVENT: &str = "deeplink:action";
const DEEPLINK_ERROR_EVENT: &str = "deeplink:error";
/// Guards the documented overlap between `get_current()` at startup and a live
/// `on_open_url` delivery of the same cold-start URL.
const OS_DEDUPE_WINDOW: Duration = Duration::from_millis(400);
const MAX_PENDING: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeeplinkSource {
    /// Delivered by the OS (`on_open_url`, startup `get_current`).
    Os,
    /// Activated from inside the app, e.g. a `glyph://` link in a note.
    InApp,
}

/// Dispatched action tagged with a process-unique id. The id lets the frontend
/// discard the pending-queue mirror of an action it already received live,
/// without guessing from timing.
#[derive(Debug, Clone, Serialize)]
pub struct DeeplinkEvent {
    pub id: u64,
    #[serde(flatten)]
    pub action: DeeplinkAction,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeeplinkErrorPayload {
    pub id: u64,
    pub code: &'static str,
}

/// Deeplinks that arrived before the app shell was listening.
#[derive(Debug, Clone, Default, Serialize)]
pub struct PendingDeeplinks {
    pub actions: Vec<DeeplinkEvent>,
    pub errors: Vec<DeeplinkErrorPayload>,
}

#[derive(Default)]
pub struct DeeplinkState {
    actions: Mutex<VecDeque<DeeplinkEvent>>,
    errors: Mutex<VecDeque<DeeplinkErrorPayload>>,
    last_os_url: Mutex<Option<(String, Instant)>>,
    next_id: AtomicU64,
}

fn push_bounded<T>(queue: &Mutex<VecDeque<T>>, item: T) {
    let mut queue = queue.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    queue.push_back(item);
    while queue.len() > MAX_PENDING {
        queue.pop_front();
    }
}

fn drain<T>(queue: &Mutex<VecDeque<T>>) -> Vec<T> {
    queue
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .drain(..)
        .collect()
}

impl DeeplinkState {
    fn next_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::Relaxed) + 1
    }

    fn take_pending(&self) -> PendingDeeplinks {
        PendingDeeplinks {
            actions: drain(&self.actions),
            errors: drain(&self.errors),
        }
    }

    fn is_repeat_os_url(&self, url: &str) -> bool {
        let mut guard = self
            .last_os_url
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let now = Instant::now();
        if let Some((previous, at)) = guard.as_ref() {
            if previous == url && now.duration_since(*at) < OS_DEDUPE_WINDOW {
                return true;
            }
        }
        *guard = Some((url.to_string(), now));
        false
    }
}

pub fn handle_url(app: &AppHandle, raw: &str, source: DeeplinkSource) {
    let Some(state) = app.try_state::<DeeplinkState>() else {
        warn!("deeplink state unavailable");
        return;
    };
    if source == DeeplinkSource::Os && state.is_repeat_os_url(raw) {
        return;
    }

    match parse_deeplink_url(raw).and_then(validate_action) {
        Ok(action) => dispatch_action(app, &state, action),
        Err(error) => {
            warn!("Rejected deeplink {raw}: {error}");
            dispatch_error(app, &state, &error);
        }
    }
}

/// Resolve the target against the filesystem before the shell is asked to
/// navigate, so a stale link fails with one clear message instead of a
/// half-applied space switch.
fn validate_action(action: DeeplinkAction) -> Result<DeeplinkAction, DeeplinkError> {
    if !Path::new(action.space_path()).is_dir() {
        return Err(DeeplinkError::SpaceNotFound);
    }
    if let DeeplinkAction::OpenNote { space, path } = &action {
        let abs = crate::paths::join_under(Path::new(space), Path::new(path))
            .map_err(|_| DeeplinkError::InvalidNotePath)?;
        if !crate::utils::is_markdown_path(&abs) {
            return Err(DeeplinkError::NoteNotMarkdown);
        }
        if !abs.is_file() {
            return Err(DeeplinkError::NoteNotFound);
        }
    }
    Ok(action)
}

fn dispatch_action(app: &AppHandle, state: &DeeplinkState, action: DeeplinkAction) {
    let event = DeeplinkEvent {
        id: state.next_id(),
        action,
    };
    // Queue before emitting: on a cold start the webview is not listening yet.
    push_bounded(&state.actions, event.clone());
    show_shell(app);
    if let Err(error) = app.emit_to(MAIN_WINDOW_LABEL, DEEPLINK_ACTION_EVENT, &event) {
        warn!("Failed to emit deeplink action: {error}");
    }
}

fn dispatch_error(app: &AppHandle, state: &DeeplinkState, error: &DeeplinkError) {
    let payload = DeeplinkErrorPayload {
        id: state.next_id(),
        code: error.code(),
    };
    push_bounded(&state.errors, payload.clone());
    show_shell(app);
    if let Err(error) = app.emit_to(MAIN_WINDOW_LABEL, DEEPLINK_ERROR_EVENT, &payload) {
        warn!("Failed to emit deeplink error: {error}");
    }
}

/// Every deeplink route needs the main app shell; auxiliary windows (quick
/// note, external markdown) never own a space session of their own.
fn show_shell(app: &AppHandle) {
    if let Err(error) = crate::show_main_window_for_app(app) {
        warn!("Failed to show main window for deeplink: {error}");
    }
}

#[tauri::command]
pub fn deeplink_take_pending(state: State<'_, DeeplinkState>) -> PendingDeeplinks {
    state.take_pending()
}

/// Frontend entry for in-note `glyph://` activation (same path as OS opens).
/// Async so the filesystem validation never runs on the UI thread.
#[tauri::command]
pub async fn deeplink_open(app: AppHandle, url: String) -> Result<(), String> {
    let trimmed = url.trim().to_string();
    if trimmed.is_empty() {
        return Err("empty deeplink".to_string());
    }
    handle_url(&app, &trimmed, DeeplinkSource::InApp);
    Ok(())
}

/// Consume a cold-start URL the plugin recorded before `on_open_url` was
/// registered. No-op on macOS, where the run event always arrives after setup.
pub fn consume_startup_url(app: &AppHandle) {
    use tauri_plugin_deep_link::DeepLinkExt;
    let Ok(Some(urls)) = app.deep_link().get_current() else {
        return;
    };
    for url in urls {
        if url.scheme() == "glyph" {
            handle_url(app, url.as_str(), DeeplinkSource::Os);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_space() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let root = std::env::temp_dir().join(format!("glyph-deeplink-test-{nanos}"));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn open_note(space: &Path, path: &str) -> DeeplinkAction {
        DeeplinkAction::OpenNote {
            space: space.to_string_lossy().to_string(),
            path: path.to_string(),
        }
    }

    #[test]
    fn validate_action_checks_space_note_and_extension() {
        let root = temp_space();
        fs::write(root.join("a.md"), "hi").unwrap();
        fs::write(root.join("b.txt"), "x").unwrap();

        assert!(validate_action(open_note(&root, "a.md")).is_ok());
        assert_eq!(
            validate_action(open_note(&root, "missing.md")),
            Err(DeeplinkError::NoteNotFound)
        );
        assert_eq!(
            validate_action(open_note(&root, "b.txt")),
            Err(DeeplinkError::NoteNotMarkdown)
        );
        assert_eq!(
            validate_action(open_note(&root, "../a.md")),
            Err(DeeplinkError::InvalidNotePath)
        );
        assert_eq!(
            validate_action(DeeplinkAction::OpenSpace {
                space: root.join("nope").to_string_lossy().to_string(),
            }),
            Err(DeeplinkError::SpaceNotFound)
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn pending_queue_is_bounded_and_drains_once() {
        let state = DeeplinkState::default();
        let root = temp_space();
        for _ in 0..MAX_PENDING + 4 {
            push_bounded(
                &state.actions,
                DeeplinkEvent {
                    id: state.next_id(),
                    action: DeeplinkAction::OpenSpace {
                        space: root.to_string_lossy().to_string(),
                    },
                },
            );
        }
        let taken = state.take_pending();
        assert_eq!(taken.actions.len(), MAX_PENDING);
        // Ids are monotonic, so the oldest entries were the ones dropped.
        assert_eq!(taken.actions[0].id, 5);

        let remaining = state.take_pending();
        assert!(remaining.actions.is_empty());
        assert!(remaining.errors.is_empty());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn repeated_os_url_is_suppressed_within_the_window() {
        let state = DeeplinkState::default();
        assert!(!state.is_repeat_os_url("glyph://open/space?space=/tmp"));
        assert!(state.is_repeat_os_url("glyph://open/space?space=/tmp"));
        assert!(!state.is_repeat_os_url("glyph://open/space?space=/other"));
    }
}
