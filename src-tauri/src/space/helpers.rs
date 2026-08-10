use serde::Serialize;
use std::path::{Path, PathBuf};

use crate::index::paths as index_paths;
use crate::glyph_paths;

#[derive(Serialize)]
pub struct SpaceInfo {
    pub root: String,
    pub schema_version: u32,
    pub welcome_note_path: Option<String>,
}

pub const VAULT_SCHEMA_VERSION: u32 = 1;
const WELCOME_NOTE_PATH: &str = "Welcome to Glyph.md";
const WELCOME_NOTE_MARKER: &str = "onboarding-note-v2.json";
const WELCOME_NOTE_CONTENT: &str = r#"# Welcome to Glyph

This is your space for plain Markdown notes. Everything you write here stays in the folder you chose, so it remains yours and works with other Markdown apps too.

This note is fully editable—keep it, change it, or delete it whenever you like.
"#;

pub fn ensure_glyph_dirs(root: &Path) -> Result<(), String> {
    let _ = glyph_paths::ensure_glyph_dir(root)?;
    let _ = glyph_paths::ensure_glyph_cache_dir(root)?;
    let _ = glyph_paths::ensure_glyph_app_dir(root)?;
    Ok(())
}

pub fn canonicalize_dir(path: &Path) -> Result<PathBuf, String> {
    let p = path.canonicalize().map_err(|e| e.to_string())?;
    if !p.is_dir() {
        return Err("selected path is not a directory".to_string());
    }
    Ok(p)
}

pub fn create_or_open_impl(root: &Path) -> Result<SpaceInfo, String> {
    index_paths::register_space(root)?;
    index_paths::remove_stale_in_space_db(root);
    ensure_glyph_dirs(root)?;
    let _ = cleanup_tmp_files(root);
    let welcome_note_path = ensure_welcome_note_for_launch(root);
    Ok(SpaceInfo {
        root: root.to_string_lossy().to_string(),
        schema_version: VAULT_SCHEMA_VERSION,
        welcome_note_path,
    })
}

fn ensure_welcome_note_for_launch(root: &Path) -> Option<String> {
    let marker = glyph_paths::glyph_app_dir(root).ok()?.join(WELCOME_NOTE_MARKER);
    if marker.exists() {
        return None;
    }

    let note_path = Path::new(WELCOME_NOTE_PATH);
    let note = crate::paths::join_under(root, note_path).ok()?;
    if !note.exists() {
        crate::io_atomic::write_atomic(&note, WELCOME_NOTE_CONTENT.as_bytes()).ok()?;
    }
    crate::io_atomic::write_atomic(&marker, b"").ok()?;
    Some(WELCOME_NOTE_PATH.to_string())
}

fn cleanup_tmp_files(root: &Path) -> Result<(), String> {
    fn should_delete(file_name: &str) -> bool {
        (file_name.starts_with('.') && file_name.contains(".tmp."))
            || file_name.ends_with(".tmp")
            || file_name.contains(".import.tmp.")
    }

    fn recurse(dir: &Path) -> Result<(), String> {
        let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let path = entry.path();
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_dir() {
                let _ = recurse(&path);
                continue;
            }
            if !meta.is_file() {
                continue;
            }
            let name = match path.file_name().and_then(|s| s.to_str()) {
                Some(s) => s,
                None => continue,
            };
            if !should_delete(name) {
                continue;
            }
            let _ = std::fs::remove_file(&path);
        }
        Ok(())
    }

    if let Ok(dir) = glyph_paths::glyph_dir(root) {
        if dir.is_dir() {
            let _ = recurse(&dir);
        }
    }
    Ok(())
}
