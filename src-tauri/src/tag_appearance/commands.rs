use std::collections::BTreeMap;
use std::sync::{Mutex, OnceLock};

use tauri::State;

use crate::space::SpaceState;

use super::store::{load_store, normalize_appearance, normalize_tag_key, save_store};
use super::types::TagAppearance;

fn tag_appearance_mutex() -> &'static Mutex<()> {
    static TAG_APPEARANCE_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();
    TAG_APPEARANCE_MUTEX.get_or_init(|| Mutex::new(()))
}

#[tauri::command]
pub async fn tag_appearance_list(
    state: State<'_, SpaceState>,
) -> Result<BTreeMap<String, TagAppearance>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        let _guard = tag_appearance_mutex()
            .lock()
            .map_err(|_| "tag appearance mutex poisoned".to_string())?;
        Ok(load_store(&root)?.entries)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn tag_appearance_set(
    state: State<'_, SpaceState>,
    tag: String,
    icon: Option<String>,
) -> Result<Option<TagAppearance>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        let tag = normalize_tag_key(&tag)?;
        let _guard = tag_appearance_mutex()
            .lock()
            .map_err(|_| "tag appearance mutex poisoned".to_string())?;
        let mut store = load_store(&root)?;
        let next = normalize_appearance(icon);
        match next.clone() {
            Some(appearance) => {
                store.entries.insert(tag, appearance);
            }
            None => {
                store.entries.remove(&tag);
            }
        }
        save_store(&root, &store)?;
        Ok(next)
    })
    .await
    .map_err(|error| error.to_string())?
}
