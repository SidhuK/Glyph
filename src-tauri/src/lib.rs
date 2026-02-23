mod ai_codex;
mod ai_rig;
mod glyph_fs;
mod glyph_paths;
mod index;
mod io_atomic;
mod links;
mod net;
mod notes;
mod paths;
mod system_fonts;
pub(crate) mod utils;
mod vault;
mod vault_fs;

use serde::Serialize;
use tauri::menu::{
    Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
};
use tauri::{
    Emitter, Manager, PhysicalPosition, PhysicalSize, Position, RunEvent, Size, WindowEvent,
};
use tracing::warn;

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

fn init_tracing() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,tauri=info,glyph_lib=info"));

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

#[tauri::command]
fn system_fonts_list() -> Result<Vec<String>, String> {
    system_fonts::list_system_font_families()
}

#[tauri::command]
fn system_monospace_fonts_list() -> Result<Vec<String>, String> {
    system_fonts::list_monospace_font_families()
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
            ai_rig::commands::refresh_provider_support_on_startup(app.handle().clone());

            if let Some(window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let monitor_size = monitor.size();
                    let monitor_pos = monitor.position();
                    let width = ((monitor_size.width as f64) * 0.7).round() as u32;
                    let height = ((monitor_size.height as f64) * 0.7).round() as u32;
                    let _ = window.set_size(Size::Physical(PhysicalSize::new(width, height)));
                    let x = monitor_pos.x + ((monitor_size.width as i32 - width as i32) / 2);
                    let y = monitor_pos.y + ((monitor_size.height as i32 - height as i32) / 2);
                    let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, y)));
                }
            }

            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    if let Err(e) =
                        apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None)
                    {
                        warn!("Failed to apply vibrancy to main window: {e}");
                    }
                } else {
                    warn!("Main window not found during setup");
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

            #[cfg(target_os = "macos")]
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    // Keep app alive on macOS when the last window is closed.
                    // Dock activation can then restore this window.
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .manage(ai_rig::AiState::default())
        .manage(ai_codex::state::CodexState::default())
        .manage(vault::VaultState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            ping,
            app_info,
            system_fonts_list,
            system_monospace_fonts_list,
            ai_rig::commands::ai_profiles_list,
            ai_rig::commands::ai_active_profile_get,
            ai_rig::commands::ai_active_profile_set,
            ai_rig::commands::ai_profile_upsert,
            ai_rig::commands::ai_profile_delete,
            ai_rig::commands::ai_secret_set,
            ai_rig::commands::ai_secret_clear,
            ai_rig::commands::ai_secret_status,
            ai_rig::commands::ai_secret_list,
            ai_rig::commands::ai_provider_support,
            ai_rig::commands::ai_audit_mark,
            ai_rig::commands::ai_chat_start,
            ai_rig::commands::ai_chat_cancel,
            ai_rig::commands::ai_chat_history_list,
            ai_rig::commands::ai_chat_history_get,
            ai_codex::commands::codex_account_read,
            ai_codex::commands::codex_login_start,
            ai_codex::commands::codex_login_complete,
            ai_codex::commands::codex_logout,
            ai_codex::commands::codex_rate_limits_read,
            ai_codex::commands::codex_chat_start,
            ai_codex::commands::codex_chat_cancel,
            ai_rig::context::ai_context_index,
            ai_rig::context::ai_context_build,
            ai_rig::context::ai_context_resolve_paths,
            ai_rig::models::ai_models_list,
            index::commands::index_rebuild,
            index::commands::search,
            index::commands::search_advanced,
            index::commands::search_parse_and_run,
            index::commands::search_view_data,
            index::commands::search_with_tags,
            index::commands::recent_notes,
            index::commands::tags_list,
            index::commands::tag_notes,
            index::commands::tag_view_data,
            index::commands::tasks_query,
            index::commands::task_set_checked,
            index::commands::task_set_dates,
            index::commands::task_dates_by_ordinal,
            index::commands::task_update_by_ordinal,
            index::commands::backlinks,
            links::commands::link_preview,
            vault_fs::list::vault_list_dir,
            vault_fs::list::vault_list_markdown_files,
            vault_fs::list::vault_list_files,
            vault_fs::link_ops::vault_resolve_wikilink,
            vault_fs::link_ops::vault_resolve_markdown_link,
            vault_fs::link_ops::vault_suggest_links,
            vault_fs::summary::vault_dir_children_summary,
            vault_fs::summary::vault_dir_recent_entries,
            vault_fs::view_data::vault_folder_view_data,
            vault_fs::read_write::vault_read_text,
            vault_fs::read_write::vault_read_texts_batch,
            vault_fs::read_write::vault_read_text_preview,
            vault_fs::read_write::vault_read_binary_preview,
            vault_fs::read_write::vault_write_text,
            vault_fs::read_write::vault_open_or_create_text,
            vault_fs::read_write::vault_create_dir,
            vault_fs::read_write::vault_rename_path,
            vault_fs::read_write::vault_delete_path,
            vault_fs::read_write::vault_resolve_abs_path,
            vault_fs::read_write::vault_relativize_path,
            glyph_fs::glyph_read_text,
            glyph_fs::glyph_write_text,
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen { .. } = event {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        });
}
