use base64::Engine;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{ErrorKind, Write};
use std::path::PathBuf;
use tauri::State;

use crate::paths;
use crate::space::SpaceState;

use super::super::helpers::deny_hidden_rel_path;

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct SavedPastedImage {
    pub asset_rel_path: String,
    pub href: String,
    pub markdown: String,
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
    match normalize_rel_path(path).rsplit_once('/') {
        Some((left, _)) => left.to_string(),
        None => String::new(),
    }
}

fn relative_path(from_dir: &str, to_path: &str) -> String {
    let from: Vec<&str> = from_dir.split('/').filter(|s| !s.is_empty()).collect();
    let to: Vec<&str> = to_path.split('/').filter(|s| !s.is_empty()).collect();
    let mut i = 0;
    while i < from.len() && i < to.len() && from[i] == to[i] {
        i += 1;
    }
    let mut out: Vec<String> = vec!["..".to_string(); from.len().saturating_sub(i)];
    out.extend(to[i..].iter().map(|s| s.to_string()));
    if out.is_empty() {
        ".".to_string()
    } else {
        out.join("/")
    }
}

fn extension_for_mime(mime: &str) -> Option<&'static str> {
    match mime.trim().to_ascii_lowercase().as_str() {
        "image/png" => Some("png"),
        "image/jpeg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/svg+xml" => Some("svg"),
        "image/bmp" => Some("bmp"),
        "image/avif" => Some("avif"),
        "image/tiff" => Some("tiff"),
        _ => None,
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
    state: State<'_, SpaceState>,
    source_path: String,
    target_dir: String,
    data_url: String,
    alt: Option<String>,
) -> Result<SavedPastedImage, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<SavedPastedImage, String> {
        let source_rel = PathBuf::from(normalize_rel_path(&source_path));
        let target_rel = PathBuf::from(normalize_rel_path(&target_dir));
        deny_hidden_rel_path(&source_rel)?;
        deny_hidden_rel_path(&target_rel)?;

        let (mime, bytes) = parse_data_url(&data_url)?;
        let ext = extension_for_mime(&mime)
            .ok_or_else(|| format!("unsupported pasted image type: {mime}"))?;

        let hash = hex::encode(Sha256::digest(&bytes));
        let file_name = format!("{hash}.{ext}");
        let asset_rel = if target_rel.as_os_str().is_empty() {
            PathBuf::from(&file_name)
        } else {
            target_rel.join(&file_name)
        };
        deny_hidden_rel_path(&asset_rel)?;

        let asset_abs = paths::join_under(&root, &asset_rel)?;
        if let Some(parent) = asset_abs.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&asset_abs)
        {
            Ok(mut file) => {
                file.write_all(&bytes).map_err(|e| e.to_string())?;
            }
            Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.to_string()),
        }

        let asset_rel_string = asset_rel.to_string_lossy().replace('\\', "/");
        let source_dir = parent_dir(&source_rel.to_string_lossy());
        let href = relative_path(&source_dir, &asset_rel_string);
        let alt_text = alt.unwrap_or_default().trim().to_string();

        Ok(SavedPastedImage {
            asset_rel_path: asset_rel_string,
            href: href.clone(),
            markdown: format!("![{alt_text}]({href})"),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
