use base64::Engine;
use std::{ffi::OsStr, io::Read, path::PathBuf};
use tauri::State;

use crate::{index, io_atomic, paths, vault::VaultState};

use super::helpers::{deny_hidden_rel_path, etag_for, file_mtime_ms};
use super::types::{
    BinaryFilePreviewDoc, TextFileDoc, TextFileDocBatch, TextFilePreviewDoc, TextFileWriteResult,
};

const TEXT_PREVIEW_DEFAULT_MAX_BYTES: u64 = 1_048_576;
const TEXT_PREVIEW_MAX_BYTES_CAP: u64 = 5_242_880;
const BINARY_PREVIEW_DEFAULT_MAX_BYTES: u64 = 20 * 1024 * 1024;
const BINARY_PREVIEW_MAX_BYTES_CAP: u64 = 30 * 1024 * 1024;

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn home_dir() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "could not resolve HOME directory for Trash".to_string())
}

#[cfg(target_os = "macos")]
fn resolve_trash_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".Trash"))
}

#[cfg(target_os = "linux")]
fn resolve_trash_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".local/share/Trash/files"))
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn resolve_trash_dir() -> Result<PathBuf, String> {
    Err("Move to Trash is not supported on this platform".to_string())
}

fn unique_trash_dest(trash_dir: &PathBuf, src: &PathBuf) -> Result<PathBuf, String> {
    let file_name = src
        .file_name()
        .ok_or_else(|| "invalid path: missing file name".to_string())?;
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("item")
        .to_string();
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();

    let base = trash_dir.join(file_name);
    if !base.exists() {
        return Ok(base);
    }

    for i in 2..10_000 {
        let candidate = trash_dir.join(format!("{stem} {i}{ext}"));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("unable to find an available Trash destination name".to_string())
}

fn move_path_to_trash(src: &PathBuf) -> Result<(), String> {
    let trash_dir = resolve_trash_dir()?;
    std::fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
    let dest = unique_trash_dest(&trash_dir, src)?;
    std::fs::rename(src, &dest).map_err(|e| e.to_string())
}

fn mime_for_preview_ext(ext: &str) -> Option<&'static str> {
    match ext {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "pdf" => Some("application/pdf"),
        _ => None,
    }
}

#[tauri::command]
pub async fn vault_read_text(
    state: State<'_, VaultState>,
    path: String,
) -> Result<TextFileDoc, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<TextFileDoc, String> {
        let rel = PathBuf::from(&path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        let bytes = std::fs::read(&abs).map_err(|e| e.to_string())?;
        let etag = etag_for(&bytes);
        let text = String::from_utf8(bytes).map_err(|_| "file is not valid UTF-8".to_string())?;
        Ok(TextFileDoc {
            rel_path: rel.to_string_lossy().to_string(),
            etag,
            mtime_ms: file_mtime_ms(&abs),
            text,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn vault_read_texts_batch(
    state: State<'_, VaultState>,
    paths: Vec<String>,
) -> Result<Vec<TextFileDocBatch>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<TextFileDocBatch>, String> {
        let mut results = Vec::with_capacity(paths.len());
        for path in paths {
            let rel = PathBuf::from(&path);
            let result = (|| -> Result<TextFileDocBatch, String> {
                deny_hidden_rel_path(&rel)?;
                let abs = paths::join_under(&root, &rel)?;
                let bytes = std::fs::read(&abs).map_err(|e| e.to_string())?;
                let etag = etag_for(&bytes);
                let text =
                    String::from_utf8(bytes).map_err(|_| "file is not valid UTF-8".to_string())?;
                Ok(TextFileDocBatch {
                    rel_path: rel.to_string_lossy().to_string(),
                    text: Some(text),
                    etag: Some(etag),
                    mtime_ms: file_mtime_ms(&abs),
                    error: None,
                })
            })();
            match result {
                Ok(doc) => results.push(doc),
                Err(e) => results.push(TextFileDocBatch {
                    rel_path: path,
                    text: None,
                    etag: None,
                    mtime_ms: 0,
                    error: Some(e),
                }),
            }
        }
        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
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
            .map(|v| v as u64)
            .unwrap_or(TEXT_PREVIEW_DEFAULT_MAX_BYTES);
        let max = requested.max(1).min(TEXT_PREVIEW_MAX_BYTES_CAP);

        let file = std::fs::File::open(&abs).map_err(|e| e.to_string())?;
        let mut bytes: Vec<u8> = Vec::new();
        file.take(max + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        let truncated = bytes.len() as u64 > max;
        if truncated {
            bytes.truncate(max as usize);
        }

        let text = String::from_utf8_lossy(&bytes).into_owned();
        Ok(TextFilePreviewDoc {
            rel_path: rel.to_string_lossy().to_string(),
            text,
            mtime_ms: file_mtime_ms(&abs),
            truncated,
            bytes_read: bytes.len() as u64,
            total_bytes,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn vault_resolve_abs_path(
    state: State<'_, VaultState>,
    path: String,
) -> Result<String, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let rel = PathBuf::from(&path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        if !abs.exists() {
            return Err("path does not exist".to_string());
        }
        if !abs.is_file() {
            return Err("path is not a file".to_string());
        }
        Ok(abs.to_string_lossy().to_string())
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
            .map(|v| v as u64)
            .unwrap_or(BINARY_PREVIEW_DEFAULT_MAX_BYTES);
        let max = requested.max(1).min(BINARY_PREVIEW_MAX_BYTES_CAP);

        let file = std::fs::File::open(&abs).map_err(|e| e.to_string())?;
        let mut bytes: Vec<u8> = Vec::new();
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

#[tauri::command(rename_all = "snake_case")]
pub async fn vault_write_text(
    state: State<'_, VaultState>,
    path: String,
    text: String,
    base_mtime_ms: Option<u64>,
) -> Result<TextFileWriteResult, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<TextFileWriteResult, String> {
        let rel = PathBuf::from(&path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        if let Some(expected) = base_mtime_ms {
            let actual = file_mtime_ms(&abs);
            if actual != 0 && actual != expected {
                return Err("conflict: on-disk file changed since it was opened".to_string());
            }
        }
        if let Some(parent) = abs.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let rel_s = rel.to_string_lossy().to_string();
        let should_index = rel.extension() == Some(OsStr::new("md"));
        let text_for_index = if should_index {
            Some(text.clone())
        } else {
            None
        };
        let bytes = text.into_bytes();
        io_atomic::write_atomic(&abs, &bytes).map_err(|e| e.to_string())?;
        if let Some(markdown) = text_for_index {
            let _ = index::index_note(&root, &rel_s, &markdown);
        }
        Ok(TextFileWriteResult {
            etag: etag_for(&bytes),
            mtime_ms: file_mtime_ms(&abs),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn vault_create_dir(state: State<'_, VaultState>, path: String) -> Result<(), String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let rel = PathBuf::from(&path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        std::fs::create_dir_all(abs).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn vault_rename_path(
    state: State<'_, VaultState>,
    from_path: String,
    to_path: String,
) -> Result<(), String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let from_rel = PathBuf::from(&from_path);
        let to_rel = PathBuf::from(&to_path);
        deny_hidden_rel_path(&from_rel)?;
        deny_hidden_rel_path(&to_rel)?;
        let from_abs = paths::join_under(&root, &from_rel)?;
        let to_abs = paths::join_under(&root, &to_rel)?;
        if !from_abs.exists() {
            return Err("source path does not exist".to_string());
        }
        if to_abs.exists() {
            return Err("destination path already exists".to_string());
        }
        if let Some(parent) = to_abs.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::rename(from_abs, to_abs).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn vault_delete_path(
    state: State<'_, VaultState>,
    path: String,
    recursive: Option<bool>,
) -> Result<(), String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let rel = PathBuf::from(&path);
        if rel.as_os_str().is_empty() {
            return Err("path is required".to_string());
        }
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        let meta = std::fs::metadata(&abs).map_err(|e| e.to_string())?;
        if meta.is_dir() {
            if recursive.unwrap_or(false) {
                move_path_to_trash(&abs)
            } else {
                Err("recursive delete must be confirmed for directories".to_string())
            }
        } else {
            move_path_to_trash(&abs)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn vault_relativize_path(
    state: State<'_, VaultState>,
    abs_path: String,
) -> Result<String, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        let abs_input = PathBuf::from(abs_path);
        let abs = if abs_input.exists() {
            abs_input.canonicalize().map_err(|e| e.to_string())?
        } else {
            let parent = abs_input
                .parent()
                .ok_or_else(|| "path has no parent directory".to_string())?;
            let file_name = abs_input
                .file_name()
                .ok_or_else(|| "path has no file name".to_string())?;
            let parent = parent.canonicalize().map_err(|e| e.to_string())?;
            parent.join(file_name)
        };
        let rel = abs
            .strip_prefix(&root)
            .map_err(|_| "path is not inside the current vault".to_string())?;
        Ok(rel.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
