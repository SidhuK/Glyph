use std::{ffi::OsStr, path::PathBuf};
use tauri::State;

use crate::{index, io_atomic, paths, vault::VaultState};

use super::helpers::{deny_hidden_rel_path, etag_for, file_mtime_ms};
use super::types::{TextFileDoc, TextFileDocBatch, TextFileWriteResult};

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

#[tauri::command]
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
