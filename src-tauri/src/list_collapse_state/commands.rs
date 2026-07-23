use tauri::{State, WebviewWindow};

use crate::space::SpaceState;

use super::store::{branches_for_path, normalize_path, set_branches_for_path};

fn validated_path(path: &str) -> Result<String, String> {
    normalize_path(path).ok_or_else(|| "path is required".to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_collapse_state_get(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    path: String,
) -> Result<Vec<String>, String> {
    let path = validated_path(&path)?;
    let root = state.root_for_window(&window)?;
    let store_mutex = state.list_collapse_state_mutex();
    tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        let _guard = store_mutex
            .lock()
            .map_err(|_| "list collapse state mutex poisoned".to_string())?;
        branches_for_path(&root, &path)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_collapse_state_set(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    path: String,
    branches: Vec<String>,
) -> Result<(), String> {
    let path = validated_path(&path)?;
    let root = state.root_for_window(&window)?;
    let store_mutex = state.list_collapse_state_mutex();
    tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        let _guard = store_mutex
            .lock()
            .map_err(|_| "list collapse state mutex poisoned".to_string())?;
        set_branches_for_path(&root, path, branches)
    })
    .await
    .map_err(|error| error.to_string())?
}
