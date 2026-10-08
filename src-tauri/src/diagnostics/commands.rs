use std::sync::mpsc::sync_channel;

use serde::Deserialize;
use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_store::StoreExt;

use super::export::{self, BundleInfo};
use crate::space_fs::read_write::paths::reveal_file_manager_path;

const MAX_FRONTEND_ENTRIES_PER_BATCH: usize = 100;
const MAX_FRONTEND_MESSAGE_CHARS: usize = 4000;

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FrontendLogLevel {
    Error,
    Warn,
}

#[derive(Deserialize)]
pub struct FrontendLogEntry {
    level: FrontendLogLevel,
    message: String,
}

/// Re-reads the saved preference and returns whether logging is active.
#[tauri::command]
pub async fn diagnostics_sync_logging(app: tauri::AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || super::sync_logging(&app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn diagnostics_log_frontend(
    window: WebviewWindow,
    entries: Vec<FrontendLogEntry>,
) -> Result<(), String> {
    if !super::logging_enabled() {
        return Ok(());
    }
    let label = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        for entry in entries.into_iter().take(MAX_FRONTEND_ENTRIES_PER_BATCH) {
            let message: String = entry
                .message
                .chars()
                .take(MAX_FRONTEND_MESSAGE_CHARS)
                .collect();
            match entry.level {
                FrontendLogLevel::Error => tracing::error!("[webview:{label}] {message}"),
                FrontendLogLevel::Warn => tracing::warn!("[webview:{label}] {message}"),
            }
        }
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn diagnostics_clear_logs() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(super::clear_logs)
        .await
        .map_err(|error| error.to_string())?
}

/// Asks where to save the zip, writes it, and reveals it in Finder. Returns
/// false when the user cancels the save panel.
#[tauri::command(rename_all = "snake_case")]
pub async fn diagnostics_export_logs(
    app: tauri::AppHandle,
    window: WebviewWindow,
    dialog_title: String,
) -> Result<bool, String> {
    let (sender, receiver) = sync_channel(1);
    let mut dialog = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_file_name(export::default_file_name())
        .set_title(dialog_title)
        .add_filter("Zip", &["zip"]);
    if let Some(home) = std::env::var_os("HOME") {
        dialog = dialog.set_directory(std::path::Path::new(&home).join("Desktop"));
    }
    dialog.save_file(move |selection| {
        let _ = sender.send(selection);
    });
    let selection = tauri::async_runtime::spawn_blocking(move || receiver.recv())
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())?;
    let Some(selection) = selection else {
        return Ok(false);
    };
    let mut destination = selection.into_path().map_err(|error| error.to_string())?;
    let has_zip_extension = destination
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"));
    if !has_zip_extension {
        destination.set_extension("zip");
    }

    let release_channel = app
        .store("settings.json")
        .ok()
        .and_then(|store| store.get("updates.releaseChannel"))
        .filter(|value| value.as_str() == Some("alpha"))
        .map_or("stable", |_| "alpha")
        .to_string();
    let info = BundleInfo {
        app_version: app.package_info().version.to_string(),
        release_channel,
    };
    tauri::async_runtime::spawn_blocking(move || {
        export::write_bundle(&info, &destination)?;
        reveal_file_manager_path(&destination)
    })
    .await
    .map_err(|error| error.to_string())??;
    Ok(true)
}
