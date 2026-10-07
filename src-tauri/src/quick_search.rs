//! Hand-off from the Quick Search panel to the main window.

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use tracing::warn;

use crate::floating_window::{hide_floating_window, FloatingWindow};
use crate::window_geometry::MAIN_WINDOW_LABEL;

const OPEN_COLLECTION_EVENT: &str = "app:open_collection";

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub(crate) enum QuickSearchTarget {
    Note { path: String },
    Collection { id: String },
}

#[derive(Clone, Serialize)]
struct OpenCollectionPayload {
    id: String,
}

pub(crate) fn emit_open_collection(app: &tauri::AppHandle, id: String) {
    if let Err(error) = app.emit_to(
        MAIN_WINDOW_LABEL,
        OPEN_COLLECTION_EVENT,
        OpenCollectionPayload { id },
    ) {
        warn!("Failed to emit open collection: {error}");
    }
}

/// Collections ride the menu command queue's readiness so a request made while
/// the shell is (re)loading is replayed by `menu_take_pending_commands`.
fn dispatch_open_collection(app: &tauri::AppHandle, id: String) -> Result<(), String> {
    let main_window_missing = app.get_webview_window(MAIN_WINDOW_LABEL).is_none();
    let state = app.state::<crate::MenuState>();
    let queued = {
        let mut pending = state
            .pending_commands
            .lock()
            .map_err(|_| "failed to lock pending menu commands".to_string())?;
        if main_window_missing || !pending.shell_ready {
            pending.collections.push(id.clone());
            true
        } else {
            false
        }
    };
    crate::show_main_window_for_app(app)?;
    if !queued {
        emit_open_collection(app, id);
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn quick_search_open_in_main(
    app: tauri::AppHandle,
    target: QuickSearchTarget,
) -> Result<(), String> {
    match target {
        QuickSearchTarget::Note { path } => {
            let space = app
                .state::<crate::space::SpaceState>()
                .root_for_window_label(MAIN_WINDOW_LABEL)?;
            let action = tauri::async_runtime::spawn_blocking(move || {
                crate::deeplink::validated_open_note(&space, &path)
            })
            .await
            .map_err(|error| error.to_string())??;
            crate::deeplink::dispatch_in_app(&app, action);
            hide_floating_window(&app, FloatingWindow::QuickSearch)
        }
        QuickSearchTarget::Collection { id } => {
            dispatch_open_collection(&app, id)?;
            hide_floating_window(&app, FloatingWindow::QuickSearch)
        }
    }
}
