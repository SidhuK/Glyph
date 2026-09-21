use std::path::Path;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Serialize;
use tauri::{State, WebviewWindow};

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
pub async fn document_write_docx(destination: String, bytes: Vec<u8>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        io_atomic::write_atomic(Path::new(&destination), &bytes).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn document_read_images_batch(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    paths: Vec<String>,
) -> Result<Vec<DocumentImageData>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .into_iter()
            .map(|path| read_image_data(&root, path))
            .collect()
    })
    .await
    .map_err(|error| error.to_string())
}
