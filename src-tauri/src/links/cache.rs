use std::{fs, path::Path};

use crate::io_atomic;

use super::types::LinkPreview;

pub fn read_cache(path: &Path) -> Option<LinkPreview> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub fn write_cache(path: &Path, preview: &LinkPreview) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(preview).map_err(|e| e.to_string())?;
    io_atomic::write_atomic(path, &bytes).map_err(|e| e.to_string())
}
