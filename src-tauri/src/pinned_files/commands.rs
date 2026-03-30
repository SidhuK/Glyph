use std::path::{Path, PathBuf};

use tauri::State;

use crate::space::SpaceState;
use crate::space_fs::helpers::deny_hidden_rel_path;

use super::store::{
    load_store, normalize_store, rewrite_entry_path, save_store, should_remove_entry, toggle_file,
};

#[tauri::command]
pub async fn pinned_files_list(state: State<'_, SpaceState>) -> Result<Vec<String>, String> {
    let root = state.current_root()?;
    let pinned_files_mutex = state.pinned_files_mutex();
    tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        let _guard = pinned_files_mutex
            .lock()
            .map_err(|_| "pinned files mutex poisoned".to_string())?;
        let (store, changed) = load_store(&root)?;
        if changed {
            save_store(&root, &store)?;
        }
        Ok(store.files)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn pinned_files_toggle(
    state: State<'_, SpaceState>,
    path: String,
) -> Result<Vec<String>, String> {
    let root = state.current_root()?;
    let pinned_files_mutex = state.pinned_files_mutex();
    tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        let rel = PathBuf::from(&path);
        if rel.as_os_str().is_empty() {
            return Err("path is required".to_string());
        }
        deny_hidden_rel_path(&rel)?;
        let _guard = pinned_files_mutex
            .lock()
            .map_err(|_| "pinned files mutex poisoned".to_string())?;
        let (mut store, _) = load_store(&root)?;
        toggle_file(&mut store, &path)?;
        save_store(&root, &store)?;
        Ok(store.files)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn pinned_files_rename_path(
    state: State<'_, SpaceState>,
    from_path: String,
    to_path: String,
) -> Result<Vec<String>, String> {
    let root = state.current_root()?;
    let pinned_files_mutex = state.pinned_files_mutex();
    tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        let from_rel = PathBuf::from(&from_path);
        let to_rel = PathBuf::from(&to_path);
        if from_rel.as_os_str().is_empty() || to_rel.as_os_str().is_empty() {
            return Err("both source and destination paths are required".to_string());
        }
        deny_hidden_rel_path(&from_rel)?;
        deny_hidden_rel_path(&to_rel)?;

        let _guard = pinned_files_mutex
            .lock()
            .map_err(|_| "pinned files mutex poisoned".to_string())?;
        let (mut store, _) = load_store(&root)?;
        store.files = store
            .files
            .into_iter()
            .map(|path| rewrite_entry_path(&path, &from_path, &to_path).unwrap_or(path))
            .collect();
        let (store, _) = normalize_and_save(root.as_path(), store)?;
        Ok(store.files)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn pinned_files_delete_path(
    state: State<'_, SpaceState>,
    path: String,
) -> Result<Vec<String>, String> {
    let root = state.current_root()?;
    let pinned_files_mutex = state.pinned_files_mutex();
    tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        let rel = PathBuf::from(&path);
        if rel.as_os_str().is_empty() {
            return Err("path is required".to_string());
        }
        deny_hidden_rel_path(&rel)?;

        let _guard = pinned_files_mutex
            .lock()
            .map_err(|_| "pinned files mutex poisoned".to_string())?;
        let (mut store, _) = load_store(&root)?;
        store
            .files
            .retain(|entry_path| !should_remove_entry(entry_path, &path));
        let (store, _) = normalize_and_save(root.as_path(), store)?;
        Ok(store.files)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn normalize_and_save(
    root: &Path,
    store: crate::pinned_files::types::PinnedFilesStore,
) -> Result<(crate::pinned_files::types::PinnedFilesStore, bool), String> {
    let (normalized, changed) = normalize_store(root, store);
    save_store(root, &normalized)?;
    Ok((normalized, changed))
}
