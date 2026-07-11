use std::collections::HashSet;
use std::sync::Mutex;

use tauri::{Emitter, Manager, State};
use tracing::{error, warn};

#[derive(Default)]
enum AppExitStatus {
    #[default]
    Idle,
    Waiting(HashSet<String>),
    Confirmed,
}

impl AppExitStatus {
    fn is_waiting_for(&self, window_label: &str) -> bool {
        matches!(self, Self::Waiting(labels) if labels.contains(window_label))
    }
}

#[derive(Default)]
struct AppExitStateInner {
    status: AppExitStatus,
    registered_windows: HashSet<String>,
    unavailable_windows: HashSet<String>,
}

#[derive(Default)]
pub(crate) struct AppExitState {
    inner: Mutex<AppExitStateInner>,
}

fn confirm_window(state: &AppExitState, window_label: &str) -> Result<bool, String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "app exit state poisoned".to_string())?;
    let AppExitStatus::Waiting(labels) = &mut inner.status else {
        return Ok(false);
    };
    labels.remove(window_label);
    if labels.is_empty() {
        inner.status = AppExitStatus::Confirmed;
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub(crate) fn app_confirm_exit(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, AppExitState>,
) -> Result<(), String> {
    if confirm_window(&state, window.label())? {
        app.exit(0);
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn app_register_exit_listener(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, AppExitState>,
) -> Result<(), String> {
    let exit_waiting = {
        let mut inner = state
            .inner
            .lock()
            .map_err(|_| "app exit state poisoned".to_string())?;
        inner.unavailable_windows.remove(window.label());
        inner.registered_windows.insert(window.label().to_string());
        inner.status.is_waiting_for(window.label())
    };
    if exit_waiting {
        app.emit_to(window.label(), "app:exit_requested", ())
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn app_report_exit_listener_failure(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, AppExitState>,
) -> Result<(), String> {
    let should_exit = {
        let mut inner = state
            .inner
            .lock()
            .map_err(|_| "app exit state poisoned".to_string())?;
        inner.registered_windows.remove(window.label());
        inner.unavailable_windows.insert(window.label().to_string());
        let AppExitStatus::Waiting(labels) = &mut inner.status else {
            return Ok(());
        };
        labels.remove(window.label());
        if labels.is_empty() {
            inner.status = AppExitStatus::Confirmed;
            true
        } else {
            false
        }
    };
    if should_exit {
        app.exit(0);
    }
    Ok(())
}

pub(crate) fn handle_exit_requested(app: &tauri::AppHandle, api: &tauri::ExitRequestApi) -> bool {
    let state = app.state::<AppExitState>();
    let Ok(mut inner) = state.inner.lock() else {
        error!("App exit state is unavailable; continuing native exit");
        return false;
    };
    if matches!(inner.status, AppExitStatus::Confirmed) {
        return false;
    }
    let labels = app
        .webview_windows()
        .into_keys()
        .filter(|label| super::is_space_host_window_label(label))
        .filter(|label| !inner.unavailable_windows.contains(label))
        .collect::<HashSet<_>>();
    if labels.is_empty() {
        return false;
    }
    let registered_windows = inner.registered_windows.clone();

    api.prevent_exit();
    inner.status = AppExitStatus::Waiting(labels.clone());
    drop(inner);

    // Every space window confirms only after its open tabs reach disk.
    for label in labels.intersection(&registered_windows) {
        if let Err(error) = app.emit_to(label, "app:exit_requested", ()) {
            warn!("Failed to request workspace save from {label}: {error}");
            // A vanished window has no remaining webview session to flush.
            if confirm_window(&state, label).unwrap_or(false) {
                app.exit(0);
            }
        }
    }
    true
}
