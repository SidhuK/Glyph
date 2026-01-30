mod io_atomic;
mod paths;
mod notes;
mod vault;

use serde::Serialize;

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

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
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
        .manage(vault::VaultState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            ping,
            app_info,
            notes::notes_list,
            notes::note_create,
            notes::note_read,
            notes::note_write,
            notes::note_delete,
            notes::note_attach_file,
            vault::vault_create,
            vault::vault_open,
            vault::vault_get_current
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
