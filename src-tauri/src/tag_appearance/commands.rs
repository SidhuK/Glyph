use std::collections::BTreeMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

use tauri::{State, WebviewWindow};

use crate::index::tags::normalize_tag;
use crate::space::SpaceState;
use crate::tag_refactor::TagRefactor;

use super::store::{load_store, normalize_appearance, normalize_tag_key, save_store};
use super::types::TagAppearance;

fn tag_appearance_mutex() -> &'static Mutex<()> {
    static TAG_APPEARANCE_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();
    TAG_APPEARANCE_MUTEX.get_or_init(|| Mutex::new(()))
}

/// Re-keys icons of the refactored tags; existing target icons win, so a merge
/// keeps the target's icon.
pub(crate) fn move_tag_appearance(
    root: &Path,
    refactor: &TagRefactor,
    keep_source: bool,
) -> Result<(), String> {
    let _guard = tag_appearance_mutex()
        .lock()
        .map_err(|_| "tag appearance mutex poisoned".to_string())?;
    let mut store = load_store(root)?;
    let moved = store
        .entries
        .iter()
        .filter_map(|(tag, appearance)| {
            let target = refactor.map(tag)?;
            Some((
                tag.clone(),
                target.as_deref().and_then(normalize_tag),
                appearance.clone(),
            ))
        })
        .collect::<Vec<_>>();
    if moved.is_empty() {
        return Ok(());
    }
    for (tag, target, appearance) in moved {
        if !keep_source {
            store.entries.remove(&tag);
        }
        if let Some(target) = target {
            store.entries.entry(target).or_insert(appearance);
        }
    }
    save_store(root, &store)
}

#[tauri::command]
pub async fn tag_appearance_list(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
) -> Result<BTreeMap<String, TagAppearance>, String> {
    let root = state.root_for_window(&window)?;
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
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    tag: String,
    icon: Option<String>,
) -> Result<Option<TagAppearance>, String> {
    let root = state.root_for_window(&window)?;
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
