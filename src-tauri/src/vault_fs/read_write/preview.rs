use base64::Engine;
use std::{io::Read, path::PathBuf};
use tauri::State;

use crate::{paths, vault::VaultState};

use super::super::helpers::{deny_hidden_rel_path, file_mtime_ms};
use super::super::types::{BinaryFilePreviewDoc, TextFilePreviewDoc};

const TEXT_PREVIEW_DEFAULT_MAX_BYTES: u64 = 1_048_576;
const TEXT_PREVIEW_MAX_BYTES_CAP: u64 = 5_242_880;
const BINARY_PREVIEW_DEFAULT_MAX_BYTES: u64 = 20 * 1024 * 1024;
const BINARY_PREVIEW_MAX_BYTES_CAP: u64 = 30 * 1024 * 1024;

fn mime_for_preview_ext(ext: &str) -> Option<&'static str> {
    match ext {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "svg" => Some("image/svg+xml"),
        "bmp" => Some("image/bmp"),
        "avif" => Some("image/avif"),
        "tif" | "tiff" => Some("image/tiff"),
        "pdf" => Some("application/pdf"),
        _ => None,
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn vault_read_text_preview(
    state: State<'_, VaultState>,
    path: String,
    max_bytes: Option<u32>,
) -> Result<TextFilePreviewDoc, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<TextFilePreviewDoc, String> {
        let rel = PathBuf::from(&path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        let total_bytes = std::fs::metadata(&abs).map_err(|e| e.to_string())?.len();
        let requested = max_bytes
            .map(|value| value as u64)
            .unwrap_or(TEXT_PREVIEW_DEFAULT_MAX_BYTES);
        let max = requested.clamp(1, TEXT_PREVIEW_MAX_BYTES_CAP);

        let file = std::fs::File::open(&abs).map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        file.take(max + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        let truncated = bytes.len() as u64 > max;
        if truncated {
            bytes.truncate(max as usize);
        }

        Ok(TextFilePreviewDoc {
            rel_path: rel.to_string_lossy().to_string(),
            text: String::from_utf8_lossy(&bytes).into_owned(),
            mtime_ms: file_mtime_ms(&abs),
            truncated,
            bytes_read: bytes.len() as u64,
            total_bytes,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn vault_read_binary_preview(
    state: State<'_, VaultState>,
    path: String,
    max_bytes: Option<u32>,
) -> Result<BinaryFilePreviewDoc, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<BinaryFilePreviewDoc, String> {
        let rel = PathBuf::from(&path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        if !abs.exists() {
            return Err("path does not exist".to_string());
        }
        if !abs.is_file() {
            return Err("path is not a file".to_string());
        }

        let ext = rel
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();
        let mime =
            mime_for_preview_ext(&ext).ok_or_else(|| "unsupported preview format".to_string())?;

        let total_bytes = std::fs::metadata(&abs).map_err(|e| e.to_string())?.len();
        let requested = max_bytes
            .map(|value| value as u64)
            .unwrap_or(BINARY_PREVIEW_DEFAULT_MAX_BYTES);
        let max = requested.clamp(1, BINARY_PREVIEW_MAX_BYTES_CAP);

        let file = std::fs::File::open(&abs).map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        file.take(max + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        let truncated = bytes.len() as u64 > max;
        if truncated {
            bytes.truncate(max as usize);
        }

        let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Ok(BinaryFilePreviewDoc {
            rel_path: rel.to_string_lossy().to_string(),
            mime: mime.to_string(),
            data_url: format!("data:{};base64,{}", mime, encoded),
            truncated,
            bytes_read: bytes.len() as u64,
            total_bytes,
            mtime_ms: file_mtime_ms(&abs),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
