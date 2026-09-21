use std::{path::Path, sync::mpsc::sync_channel};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Serialize;
use tauri::{State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use crate::{io_atomic, space::SpaceState, space_asset_protocol::read_space_image};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentImageData {
    rel_path: String,
    data_url: Option<String>,
}

fn read_image_data(root: &Path, rel_path: String) -> DocumentImageData {
    let data_url = read_space_image(root, Path::new(&rel_path))
        .map(|(mime, bytes)| format!("data:{mime};base64,{}", BASE64.encode(bytes)));
    DocumentImageData { rel_path, data_url }
}

#[tauri::command]
pub fn document_print_current_window(window: WebviewWindow) -> Result<(), String> {
    window.print().map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn document_write_docx(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    expected_space_path: String,
    file_name: String,
    dialog_title: String,
    format_name: String,
    bytes: Vec<u8>,
) -> Result<bool, String> {
    let root = state.root_for_window(&window)?;
    if root != Path::new(&expected_space_path) {
        return Err("The active space changed during document export.".to_string());
    }
    let file_name = Path::new(&file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Document export file name is invalid.".to_string())?
        .to_string();
    let (sender, receiver) = sync_channel(1);
    window
        .dialog()
        .file()
        .set_parent(&window)
        .set_directory(root)
        .set_file_name(file_name)
        .set_title(dialog_title)
        .add_filter(format_name, &["docx"])
        .save_file(move |selection| {
            let _ = sender.send(selection);
        });
    let selection = tauri::async_runtime::spawn_blocking(move || receiver.recv())
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())?;
    let Some(selection) = selection else {
        return Ok(false);
    };
    let mut destination = selection.into_path().map_err(|error| error.to_string())?;
    let has_docx_extension = destination
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("docx"));
    if !has_docx_extension {
        destination.set_extension("docx");
    }
    tauri::async_runtime::spawn_blocking(move || {
        io_atomic::write_atomic(&destination, &bytes).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())??;
    Ok(true)
}

#[tauri::command]
pub async fn document_read_images_batch(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    expected_space_path: String,
    paths: Vec<String>,
) -> Result<Vec<DocumentImageData>, String> {
    let root = state.root_for_window(&window)?;
    if root != Path::new(&expected_space_path) {
        return Err("The active space changed during document export.".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .into_iter()
            .map(|path| read_image_data(&root, path))
            .collect()
    })
    .await
    .map_err(|error| error.to_string())
}
