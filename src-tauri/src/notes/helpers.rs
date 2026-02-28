use std::path::{Path, PathBuf};

use crate::paths;

use super::frontmatter::{now_rfc3339, parse_frontmatter, split_frontmatter};
use super::types::NoteMeta;

pub use crate::utils::file_mtime_ms;

pub fn note_rel_path(note_id: &str) -> Result<PathBuf, String> {
    let _ = uuid::Uuid::parse_str(note_id).map_err(|_| "invalid note id".to_string())?;
    Ok(PathBuf::from("notes").join(format!("{note_id}.md")))
}

pub fn note_abs_path(space_root: &Path, note_id: &str) -> Result<PathBuf, String> {
    let rel = note_rel_path(note_id)?;
    paths::join_under(space_root, &rel)
}

pub fn notes_dir(space_root: &Path) -> Result<PathBuf, String> {
    paths::join_under(space_root, Path::new("notes"))
}

pub fn assets_dir(space_root: &Path) -> Result<PathBuf, String> {
    paths::join_under(space_root, Path::new("assets"))
}

pub fn read_to_string(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

pub fn etag_for(markdown: &str) -> String {
    crate::utils::sha256_hex(markdown.as_bytes())
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
