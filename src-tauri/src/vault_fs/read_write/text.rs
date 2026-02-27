use std::{ffi::OsStr, io::Write, path::PathBuf};
use tauri::State;

use crate::{index, io_atomic, paths, vault::VaultState};

use super::super::helpers::{deny_hidden_rel_path, etag_for, file_mtime_ms};
use super::super::types::{
    OpenOrCreateTextResult, TextFileDoc, TextFileDocBatch, TextFileWriteResult,
};

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
        let text =
            String::from_utf8(bytes.clone()).map_err(|_| "file is not valid UTF-8".to_string())?;
        Ok(TextFileDoc {
            rel_path: rel.to_string_lossy().to_string(),
            etag: etag_for(&bytes),
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
                let text = String::from_utf8(bytes.clone())
                    .map_err(|_| "file is not valid UTF-8".to_string())?;
                Ok(TextFileDocBatch {
                    rel_path: rel.to_string_lossy().to_string(),
                    text: Some(text),
                    etag: Some(etag_for(&bytes)),
                    mtime_ms: file_mtime_ms(&abs),
                    error: None,
                })
            })();
            match result {
                Ok(doc) => results.push(doc),
                Err(error) => results.push(TextFileDocBatch {
                    rel_path: path,
                    text: None,
                    etag: None,
                    mtime_ms: 0,
                    error: Some(error),
                }),
            }
        }
        Ok(results)
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

        let rel_path = rel.to_string_lossy().to_string();
        let should_index = rel.extension() == Some(OsStr::new("md"));
        let bytes = text.into_bytes();
        io_atomic::write_atomic(&abs, &bytes).map_err(|e| e.to_string())?;
        if should_index {
            if let Ok(markdown) = std::str::from_utf8(&bytes) {
                let _ = index::index_note(&root, &rel_path, markdown);
            }
        }

        Ok(TextFileWriteResult {
            etag: etag_for(&bytes),
            mtime_ms: file_mtime_ms(&abs),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn vault_open_or_create_text(
    state: State<'_, VaultState>,
    path: String,
    text: String,
) -> Result<OpenOrCreateTextResult, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<OpenOrCreateTextResult, String> {
        let rel = PathBuf::from(&path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;

        if abs.exists() {
            return Ok(OpenOrCreateTextResult {
                created: false,
                mtime_ms: file_mtime_ms(&abs),
            });
        }

        if let Some(parent) = abs.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&abs)
        {
            Ok(mut file) => {
                file.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                return Ok(OpenOrCreateTextResult {
                    created: false,
                    mtime_ms: file_mtime_ms(&abs),
                });
            }
            Err(error) => return Err(error.to_string()),
        }
        Ok(OpenOrCreateTextResult {
            created: true,
            mtime_ms: file_mtime_ms(&abs),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
