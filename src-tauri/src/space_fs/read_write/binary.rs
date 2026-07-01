use base64::Engine;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{State, WebviewWindow};

use crate::space::SpaceState;

use super::super::helpers::deny_hidden_rel_path;
use super::pasted_image::{extension_for_mime, filename_for_mime, write_or_reuse_asset};

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct SavedPastedImage {
    pub asset_rel_path: String,
    pub href: String,
}

fn normalize_rel_path(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    let mut parts: Vec<&str> = Vec::new();
    for part in normalized.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            let _ = parts.pop();
            continue;
        }
        parts.push(part);
    }
    parts.join("/")
}

fn parent_dir(path: &str) -> String {
    let normalized = normalize_rel_path(path);
    match normalized.rsplit_once('/') {
        Some((parent, _)) => parent.to_string(),
        None => String::new(),
    }
}

fn relative_path(from_dir: &str, to_path: &str) -> String {
    let from: Vec<&str> = from_dir
        .split('/')
        .filter(|part| !part.is_empty())
        .collect();
    let to: Vec<&str> = to_path.split('/').filter(|part| !part.is_empty()).collect();
    let mut common = 0;
    while common < from.len() && common < to.len() && from[common] == to[common] {
        common += 1;
    }

    let mut parts: Vec<String> = vec!["..".to_string(); from.len().saturating_sub(common)];
    parts.extend(to[common..].iter().map(|part| (*part).to_string()));
    if parts.is_empty() {
        ".".to_string()
    } else {
        parts.join("/")
    }
}

fn parse_data_url(data_url: &str) -> Result<(String, Vec<u8>), String> {
    let trimmed = data_url.trim();
    let rest = trimmed
        .strip_prefix("data:")
        .ok_or_else(|| "invalid image payload".to_string())?;
    let (meta, encoded) = rest
        .split_once(',')
        .ok_or_else(|| "invalid image payload".to_string())?;
    if !meta.ends_with(";base64") {
        return Err("image payload must be base64 encoded".to_string());
    }
    let mime = meta.trim_end_matches(";base64").trim().to_ascii_lowercase();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .map_err(|_| "failed to decode image payload".to_string())?;
    if bytes.is_empty() {
        return Err("pasted image is empty".to_string());
    }
    Ok((mime, bytes))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_save_pasted_image(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    source_path: String,
    target_dir: String,
    data_url: String,
    original_filename: Option<String>,
) -> Result<SavedPastedImage, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<SavedPastedImage, String> {
        let source_rel = PathBuf::from(normalize_rel_path(&source_path));
        let target_rel = PathBuf::from(normalize_rel_path(&target_dir));
        deny_hidden_rel_path(&source_rel)?;
        deny_hidden_rel_path(&target_rel)?;

        let (mime, bytes) = parse_data_url(&data_url)?;
        let ext = extension_for_mime(&mime)
            .ok_or_else(|| format!("unsupported pasted image type: {mime}"))?;

        let asset_file_name = filename_for_mime(original_filename.as_deref(), &mime, ext)?;
        let asset_rel = write_or_reuse_asset(&root, &target_rel, &asset_file_name, &bytes)?;

        let asset_rel_string = asset_rel.to_string_lossy().replace('\\', "/");
        let source_dir = parent_dir(&source_rel.to_string_lossy());
        let href = relative_path(&source_dir, &asset_rel_string);

        Ok(SavedPastedImage {
            asset_rel_path: asset_rel_string,
            href,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
