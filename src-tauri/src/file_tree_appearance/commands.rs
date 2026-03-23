use std::collections::BTreeMap;
use std::path::PathBuf;

use tauri::State;

use crate::space::SpaceState;
use crate::space_fs::helpers::deny_hidden_rel_path;

use super::store::{bootstrap, load_store, rewrite_entry_path, save_store, should_remove_entry};
use super::types::FileTreeAppearance;

#[tauri::command]
pub async fn file_tree_appearance_list(
    state: State<'_, SpaceState>,
) -> Result<BTreeMap<String, FileTreeAppearance>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        Ok(bootstrap(load_store(&root)?).entries)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn file_tree_appearance_set(
    state: State<'_, SpaceState>,
    path: String,
    color: Option<String>,
    icon: Option<String>,
) -> Result<Option<FileTreeAppearance>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        let rel = PathBuf::from(&path);
        if rel.as_os_str().is_empty() {
            return Err("path is required".to_string());
        }
        deny_hidden_rel_path(&rel)?;
        let mut store = bootstrap(load_store(&root)?);
        let next = FileTreeAppearance { color, icon }.normalized();
        match next.clone() {
            Some(appearance) => {
                store.entries.insert(path, appearance);
            }
            None => {
                store.entries.remove(&path);
            }
        }
        save_store(&root, &store)?;
        Ok(next)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn file_tree_appearance_rename_path(
    state: State<'_, SpaceState>,
    from_path: String,
    to_path: String,
) -> Result<(), String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let from_rel = PathBuf::from(&from_path);
        let to_rel = PathBuf::from(&to_path);
        if from_rel.as_os_str().is_empty() || to_rel.as_os_str().is_empty() {
            return Err("both source and destination paths are required".to_string());
        }
        deny_hidden_rel_path(&from_rel)?;
        deny_hidden_rel_path(&to_rel)?;
        let mut store = bootstrap(load_store(&root)?);
        store.entries = store
            .entries
            .into_iter()
            .map(
                |(path, appearance)| match rewrite_entry_path(&path, &from_path, &to_path) {
                    Some(next_path) => (next_path, appearance),
                    None => (path, appearance),
                },
            )
            .collect();
        save_store(&root, &store)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn file_tree_appearance_delete_path(
    state: State<'_, SpaceState>,
    path: String,
) -> Result<(), String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let rel = PathBuf::from(&path);
        if rel.as_os_str().is_empty() {
            return Err("path is required".to_string());
        }
        deny_hidden_rel_path(&rel)?;
        let mut store = bootstrap(load_store(&root)?);
        store
            .entries
            .retain(|entry_path, _| !should_remove_entry(entry_path, &path));
        save_store(&root, &store)
    })
    .await
    .map_err(|error| error.to_string())?
}
