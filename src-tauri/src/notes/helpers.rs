use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

use crate::paths;

use super::frontmatter::{now_rfc3339, parse_frontmatter, split_frontmatter};
use super::types::NoteMeta;

pub fn note_rel_path(note_id: &str) -> Result<PathBuf, String> {
    let _ = uuid::Uuid::parse_str(note_id).map_err(|_| "invalid note id".to_string())?;
    Ok(PathBuf::from("notes").join(format!("{note_id}.md")))
}

pub fn note_abs_path(vault_root: &Path, note_id: &str) -> Result<PathBuf, String> {
    let rel = note_rel_path(note_id)?;
    paths::join_under(vault_root, &rel)
}

pub fn notes_dir(vault_root: &Path) -> Result<PathBuf, String> {
    paths::join_under(vault_root, Path::new("notes"))
}

pub fn assets_dir(vault_root: &Path) -> Result<PathBuf, String> {
    paths::join_under(vault_root, Path::new("assets"))
}

pub fn read_to_string(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

pub fn file_mtime_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn etag_for(markdown: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(markdown.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn extract_meta(note_id: &str, markdown: &str) -> Result<NoteMeta, String> {
    let (yaml, _body) = split_frontmatter(markdown);
    let fm = parse_frontmatter(yaml)?;
    let created = fm.created.clone().unwrap_or_else(now_rfc3339);
    let updated = fm.updated.clone().unwrap_or_else(now_rfc3339);
    Ok(NoteMeta {
        id: note_id.to_string(),
        title: fm.title.unwrap_or_else(|| "Untitled".to_string()),
        created,
        updated,
    })
}
