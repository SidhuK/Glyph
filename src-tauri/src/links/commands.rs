use std::fs;
use tauri::State;

use crate::vault::VaultState;

use super::cache::{read_cache, write_cache};
use super::fetch::{build_preview, fetch_html};
use super::helpers::{
    cache_dir, cache_path, http_client, normalize_url, now_ms, resolve_image_url, TTL_ERR_MS,
    TTL_OK_MS,
};
use super::types::LinkPreview;

#[tauri::command]
pub async fn link_preview(
    state: State<'_, VaultState>,
    url: String,
    force: Option<bool>,
) -> Result<LinkPreview, String> {
    let root = state.current_root()?;
    let force = force.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || -> Result<LinkPreview, String> {
        let client = http_client()?;
        let normalized = normalize_url(&url)?;
        let normalized_str = normalized.as_str().to_string();

        let path = cache_path(&root, &normalized_str)?;
        if !force {
            if let Some(cached) = read_cache(&path) {
                let age = now_ms().saturating_sub(cached.fetched_at_ms);
                let ttl = if cached.ok { TTL_OK_MS } else { TTL_ERR_MS };
                if age <= ttl {
                    return Ok(cached);
                }
            }
        }

        let dir = cache_dir(&root)?;
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

        match fetch_html(&client, &normalized) {
            Ok(html) => {
                let preview = build_preview(
                    &root,
                    &client,
                    &normalized,
                    Some(&html),
                    None,
                    resolve_image_url,
                );
                let _ = write_cache(&path, &preview);
                Ok(preview)
            }
            Err(e) => {
                let preview = build_preview(
                    &root,
                    &client,
                    &normalized,
                    None,
                    Some(&e),
                    resolve_image_url,
                );
                let _ = write_cache(&path, &preview);
                Ok(preview)
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
