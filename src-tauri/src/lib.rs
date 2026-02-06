mod ai;
mod canvas;
mod index;
mod io_atomic;
mod links;
mod net;
mod notes;
mod paths;
mod tether_fs;
mod tether_paths;
mod vault;
mod vault_fs;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID};
use tauri::{Emitter, Manager, WindowEvent};

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

fn init_tracing() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,tauri=info,app_lib=info"));

    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .try_init();
}

#[derive(Serialize)]
struct AppInfo {
    name: String,
    version: String,
    identifier: String,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn ping() -> &'static str {
    "pong"
}

#[tauri::command]
fn app_info(app: tauri::AppHandle) -> AppInfo {
    let package = app.package_info();
    let config = app.config();
    AppInfo {
        name: package.name.clone(),
        version: package.version.to_string(),
        identifier: config.identifier.clone(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_tracing();

    tauri::Builder::default()
        .menu(|app| {
            #[cfg(target_os = "macos")]
            let app_menu = Submenu::with_items(
                app,
                app.package_info().name.clone(),
                true,
                &[
                    &PredefinedMenuItem::about(app, None, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?;

            let open_vault = MenuItem::with_id(
                app,
                "file.open_vault",
                "Open Vault…",
                true,
                Some("CmdOrCtrl+O"),
            )?;
            let create_vault = MenuItem::with_id(
                app,
                "file.create_vault",
                "Create Vault…",
                true,
                Some("CmdOrCtrl+Shift+N"),
            )?;
            let close_vault =
                MenuItem::with_id(app, "file.close_vault", "Close Vault", true, None::<&str>)?;

            let file_menu = Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &open_vault,
                    &create_vault,
                    &close_vault,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                    #[cfg(not(target_os = "macos"))]
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?;

            let edit_menu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?;

            let window_menu = Submenu::with_id_and_items(
                app,
                WINDOW_SUBMENU_ID,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    #[cfg(target_os = "macos")]
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?;

            let help_menu = Submenu::with_id_and_items(
                app,
                HELP_SUBMENU_ID,
                "Help",
                true,
                &[
                    #[cfg(not(target_os = "macos"))]
                    &PredefinedMenuItem::about(app, None, None)?,
                ],
            )?;

            Menu::with_items(
                app,
                &[
                    #[cfg(target_os = "macos")]
                    &app_menu,
                    &file_menu,
                    &edit_menu,
                    &window_menu,
                    &help_menu,
                ],
            )
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "file.open_vault" => {
                let _ = app.emit("menu:open_vault", ());
            }
            "file.create_vault" => {
                let _ = app.emit("menu:create_vault", ());
            }
            "file.close_vault" => {
                let _ = app.emit("menu:close_vault", ());
            }
            _ => {}
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let window = app.get_webview_window("main").unwrap();
                apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None)
                    .expect("Failed to apply vibrancy");

                if let Some(settings) = app.get_webview_window("settings") {
                    let _ = apply_vibrancy(&settings, NSVisualEffectMaterial::Sidebar, None, None);
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "settings" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .manage(ai::AiState::default())
        .manage(vault::VaultState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            ping,
            app_info,
            ai::commands::ai_profiles_list,
            ai::commands::ai_active_profile_get,
            ai::commands::ai_active_profile_set,
            ai::commands::ai_profile_upsert,
            ai::commands::ai_profile_delete,
            ai::commands::ai_secret_set,
            ai::commands::ai_secret_clear,
            ai::commands::ai_secret_status,
            ai::commands::ai_audit_mark,
            ai::commands::ai_chat_start,
            ai::commands::ai_chat_cancel,
            canvas::canvas_list,
            canvas::canvas_create,
            canvas::canvas_read,
            canvas::canvas_write,
            index::commands::index_rebuild,
            index::commands::index_note_previews_batch,
            index::commands::search,
            index::commands::tags_list,
            index::commands::tag_notes,
            index::commands::backlinks,
            links::commands::link_preview,
            vault_fs::list::vault_list_dir,
            vault_fs::list::vault_list_markdown_files,
            vault_fs::list::vault_list_files,
            vault_fs::summary::vault_dir_children_summary,
            vault_fs::summary::vault_dir_recent_entries,
            vault_fs::read_write::vault_read_text,
            vault_fs::read_write::vault_read_texts_batch,
            vault_fs::read_write::vault_read_text_preview,
            vault_fs::read_write::vault_read_binary_preview,
            vault_fs::read_write::vault_write_text,
            vault_fs::read_write::vault_create_dir,
            vault_fs::read_write::vault_rename_path,
            vault_fs::read_write::vault_resolve_abs_path,
            vault_fs::read_write::vault_relativize_path,
            tether_fs::tether_read_text,
            tether_fs::tether_write_text,
            notes::commands::notes_list,
            notes::commands::note_create,
            notes::commands::note_read,
            notes::commands::note_write,
            notes::commands::note_delete,
            notes::attachments::note_attach_file,
            vault::commands::vault_create,
            vault::commands::vault_open,
            vault::commands::vault_get_current,
            vault::commands::vault_close
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
