use serde::Serialize;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::{io_atomic, utils};

const EXTERNAL_MARKDOWN_LABEL_PREFIX: &str = "external-markdown-";
const EXTERNAL_MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown", "mdown"];

#[derive(Default)]
pub struct ExternalMarkdownState {
    paths_by_window: Mutex<HashMap<String, String>>,
}

#[derive(Serialize)]
pub struct ExternalMarkdownDoc {
    pub path: String,
    pub text: String,
    pub etag: String,
    pub mtime_ms: u64,
}

#[derive(Serialize)]
pub struct ExternalMarkdownWriteResult {
    pub etag: String,
    pub mtime_ms: u64,
}

fn is_supported_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            EXTERNAL_MARKDOWN_EXTENSIONS
                .iter()
                .any(|allowed| extension.eq_ignore_ascii_case(allowed))
        })
        .unwrap_or(false)
}

fn validate_markdown_file(path: &Path) -> Result<(), String> {
    if !path.is_absolute() {
        return Err("external markdown path must be absolute".to_string());
    }
    if !is_supported_markdown_path(path) {
        return Err("unsupported external markdown file type".to_string());
    }
    let metadata = path.metadata().map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("external markdown path is not a file".to_string());
    }
    Ok(())
}

fn etag_for(bytes: &[u8]) -> String {
    utils::sha256_hex(bytes)
}

fn file_name_for_title(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("Markdown File")
        .to_string()
}

fn external_markdown_label(path: &Path) -> String {
    let path_hash = utils::sha256_hex(path.to_string_lossy().as_bytes());
    format!("{EXTERNAL_MARKDOWN_LABEL_PREFIX}{}", &path_hash[..16])
}

pub fn is_external_markdown_window(label: &str) -> bool {
    label.starts_with(EXTERNAL_MARKDOWN_LABEL_PREFIX)
}

pub fn open_external_markdown_window(
    app: &tauri::AppHandle,
    state: &ExternalMarkdownState,
    path: PathBuf,
) -> Result<(), String> {
    validate_markdown_file(&path)?;

    let label = external_markdown_label(&path);
    {
        let mut paths_by_window = state
            .paths_by_window
            .lock()
            .map_err(|_| "failed to lock external markdown state".to_string())?;
        paths_by_window.insert(label.clone(), path.to_string_lossy().to_string());
    }

    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|error| error.to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::App(format!("index.html?window={label}").into()),
    )
    .title(format!("{} - Glyph", file_name_for_title(&path)))
    .inner_size(820.0, 720.0)
    .min_inner_size(520.0, 360.0)
    .resizable(true)
    .decorations(true)
    .title_bar_style(tauri::TitleBarStyle::Overlay)
    .hidden_title(true)
    .transparent(false)
    .shadow(true)
    .center()
    .build()
    .map_err(|error| error.to_string())?;

    window.set_focus().map_err(|error| error.to_string())
}

pub fn forget_external_markdown_window(
    state: &ExternalMarkdownState,
    label: &str,
) -> Result<(), String> {
    state
        .paths_by_window
        .lock()
        .map_err(|_| "failed to lock external markdown state".to_string())?
        .remove(label);
    Ok(())
}

#[tauri::command]
pub fn external_markdown_window_path(
    window: tauri::WebviewWindow,
    state: State<'_, ExternalMarkdownState>,
) -> Result<String, String> {
    state
        .paths_by_window
        .lock()
        .map_err(|_| "failed to lock external markdown state".to_string())?
        .get(window.label())
        .cloned()
        .ok_or_else(|| "external markdown file is not registered for this window".to_string())
}

fn registered_path_for_window(
    window: &tauri::WebviewWindow,
    state: &ExternalMarkdownState,
    supplied_path: &str,
) -> Result<PathBuf, String> {
    let registered_path = state
        .paths_by_window
        .lock()
        .map_err(|_| "failed to lock external markdown state".to_string())?
        .get(window.label())
        .cloned()
        .ok_or_else(|| "external markdown file is not registered for this window".to_string())?;
    if PathBuf::from(supplied_path) != PathBuf::from(&registered_path) {
        return Err("external markdown path does not match this window".to_string());
    }
    Ok(PathBuf::from(registered_path))
}

#[tauri::command]
pub async fn external_markdown_read(
    window: tauri::WebviewWindow,
    state: State<'_, ExternalMarkdownState>,
    path: String,
) -> Result<ExternalMarkdownDoc, String> {
    let path = registered_path_for_window(&window, &state, &path)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<ExternalMarkdownDoc, String> {
        validate_markdown_file(&path)?;
        let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
        let text =
            String::from_utf8(bytes.clone()).map_err(|_| "file is not valid UTF-8".to_string())?;
        Ok(ExternalMarkdownDoc {
            path: path.to_string_lossy().to_string(),
            etag: etag_for(&bytes),
            mtime_ms: utils::file_mtime_ms(&path),
            text,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn external_markdown_write(
    window: tauri::WebviewWindow,
    state: State<'_, ExternalMarkdownState>,
    path: String,
    text: String,
    base_mtime_ms: Option<u64>,
) -> Result<ExternalMarkdownWriteResult, String> {
    let path = registered_path_for_window(&window, &state, &path)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<ExternalMarkdownWriteResult, String> {
        validate_markdown_file(&path)?;
        if let Some(expected) = base_mtime_ms {
            let actual = utils::file_mtime_ms(&path);
            if actual != 0 && actual != expected {
                return Err("conflict: on-disk file changed since it was opened".to_string());
            }
        }

        let bytes = text.into_bytes();
        io_atomic::write_atomic(&path, &bytes).map_err(|error| error.to_string())?;
        Ok(ExternalMarkdownWriteResult {
            etag: etag_for(&bytes),
            mtime_ms: utils::file_mtime_ms(&path),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn external_markdown_finish_close(window: tauri::WebviewWindow) -> Result<(), String> {
    if !is_external_markdown_window(window.label()) {
        return Err("window is not an external markdown window".to_string());
    }
    window.destroy().map_err(|error| error.to_string())
}
