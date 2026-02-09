use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tauri::State;

use crate::vault::VaultState;

use super::helpers::{assets_dir, note_rel_path};
use super::types::AttachmentResult;

fn is_image_ext(ext: &str) -> bool {
    matches!(ext, "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg")
}

fn copy_into_assets_atomic(assets_dir: &Path, source: &Path) -> Result<(String, PathBuf), String> {
    let src_file = File::open(source).map_err(|e| e.to_string())?;
    let mut reader = std::io::BufReader::new(src_file);

    let original_ext = source
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    let ext = if original_ext.is_empty() {
        "".to_string()
    } else {
        format!(".{original_ext}")
    };

    std::fs::create_dir_all(assets_dir).map_err(|e| e.to_string())?;
    let tmp_path = assets_dir.join(format!(".import.tmp.{}", uuid::Uuid::new_v4()));
    let mut tmp = File::create(&tmp_path).map_err(|e| e.to_string())?;

    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        tmp.write_all(&buf[..n]).map_err(|e| e.to_string())?;
    }
    tmp.sync_all().map_err(|e| e.to_string())?;

    let hash_hex = hex::encode(hasher.finalize());
    let file_name = format!("{hash_hex}{ext}");
    let dest_path = assets_dir.join(&file_name);

    if dest_path.exists() {
        let _ = std::fs::remove_file(&tmp_path);
        return Ok((file_name, dest_path));
    }

    std::fs::rename(&tmp_path, &dest_path).map_err(|e| e.to_string())?;
    Ok((file_name, dest_path))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn note_attach_file(
    state: State<'_, VaultState>,
    note_id: String,
    source_path: String,
) -> Result<AttachmentResult, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<AttachmentResult, String> {
        let _ = note_rel_path(&note_id)?;
        let assets = assets_dir(&root)?;
        let source = PathBuf::from(source_path);
        if !source.is_file() {
            return Err("selected attachment is not a file".to_string());
        }

        let (file_name, _dest) = copy_into_assets_atomic(&assets, &source)?;
        let asset_rel_path = format!("assets/{file_name}");
        let note_rel = format!("../assets/{file_name}");

        let ext = Path::new(&file_name)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        let markdown = if !ext.is_empty() && is_image_ext(&ext) {
            format!("![]({note_rel})")
        } else {
            format!("[{file_name}]({note_rel})")
        };

        Ok(AttachmentResult {
            asset_rel_path,
            markdown,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
