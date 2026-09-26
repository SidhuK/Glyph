use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use super::tools::safe_join;
use crate::note_mutation::{emit_changed, SpaceChange};
use crate::space::state::{mark_recent_local_change, RecentLocalChanges};
use crate::{index, io_atomic, utils};

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReviewError {
    Conflict { path: String },
    Busy,
    RecoveryRequired,
    InvalidOperation,
    AlreadyReviewed,
    InvalidPath,
    UnsupportedFile,
    FileExists,
    FileNotFound,
    PatchMismatch,
    Cancelled,
    Failed { message: String },
}

impl From<String> for ReviewError {
    fn from(message: String) -> Self {
        Self::Failed { message }
    }
}

impl std::fmt::Display for ReviewError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let value = serde_json::to_string(self).map_err(|_| std::fmt::Error)?;
        f.write_str(&value)
    }
}

impl std::error::Error for ReviewError {}

pub const MAX_EDIT_BYTES: usize = 512 * 1024;

#[derive(Clone, Deserialize, Serialize)]
pub struct FileEdit {
    pub before: Option<String>,
    pub after: Option<String>,
}

pub type Files = BTreeMap<String, FileEdit>;

fn checked_path(root: &Path, path: &str) -> Result<PathBuf, ReviewError> {
    let abs = safe_join(root, path).map_err(|e| e.to_string())?;
    let rel = abs.strip_prefix(root).map_err(|e| e.to_string())?;
    if rel.as_os_str().is_empty() {
        return Err(ReviewError::InvalidPath);
    }
    let mut current = root.to_path_buf();
    for component in rel.components() {
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(meta) if meta.file_type().is_symlink() => return Err(ReviewError::InvalidPath),
            Ok(meta) if current != abs && !meta.is_dir() => return Err(ReviewError::InvalidPath),
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string().into()),
        }
    }
    Ok(abs)
}

pub fn read(root: &Path, path: &str) -> Result<Option<String>, ReviewError> {
    let abs = checked_path(root, path)?;
    match fs::metadata(&abs) {
        Ok(meta) => {
            if !meta.is_file() || meta.len() > MAX_EDIT_BYTES as u64 {
                return Err(ReviewError::UnsupportedFile);
            }
            fs::read_to_string(abs)
                .map(Some)
                .map_err(|e| ReviewError::from(e.to_string()))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string().into()),
    }
}

pub fn validate(root: &Path, files: &Files) -> Result<(), ReviewError> {
    for (path, edit) in files {
        if read(root, path)? != edit.before {
            return Err(ReviewError::Conflict { path: path.clone() });
        }
    }
    Ok(())
}

pub struct WriteContext<'a> {
    pub root: &'a Path,
    pub app: &'a tauri::AppHandle,
    pub window_label: &'a str,
    pub recent: &'a RecentLocalChanges,
}

fn write(ctx: &WriteContext<'_>, path: &str, edit: &FileEdit) -> Result<(), ReviewError> {
    let abs = checked_path(ctx.root, path)?;
    let space = ctx.root.to_string_lossy().into_owned();
    let current = read(ctx.root, path)?;
    if current != edit.before && current != edit.after {
        return Err(ReviewError::Conflict {
            path: path.to_string(),
        });
    }
    let exists = current.is_some();
    let change = if let Some(text) = &edit.after {
        if let Some(parent) = abs.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if !exists {
            if !io_atomic::write_atomic_create_new(&abs, text.as_bytes())
                .map_err(|e| e.to_string())?
            {
                return Err(ReviewError::Conflict {
                    path: path.to_string(),
                });
            }
        } else if current != edit.after {
            io_atomic::write_atomic(&abs, text.as_bytes()).map_err(|e| e.to_string())?;
        }
        if exists {
            SpaceChange::content(&space, path)
        } else {
            SpaceChange::create(&space, path)
        }
    } else {
        if exists {
            fs::remove_file(&abs).map_err(|e| e.to_string())?;
        }
        SpaceChange::remove(&space, path, false)
    };
    let indexed = if utils::is_markdown_path(&abs) {
        match &edit.after {
            Some(text) => index::index_note(ctx.root, path, text),
            None => index::remove_note(ctx.root, path),
        }
    } else {
        Ok(())
    };
    if indexed.is_ok() {
        mark_recent_local_change(ctx.recent, path);
    }
    emit_changed(ctx.app, ctx.window_label, &change);
    // Keep the recovery journal on indexing errors as well as filesystem errors.
    indexed.map_err(ReviewError::from)
}

// The durable transaction is retained until all files and their indexes are updated.
// Recovery tolerates either side of each write, but never overwrites unrelated edits.
pub fn apply(ctx: &WriteContext<'_>, files: &Files) -> Result<(), ReviewError> {
    for (path, edit) in files {
        let current = read(ctx.root, path)?;
        if current != edit.before && current != edit.after {
            return Err(ReviewError::Conflict { path: path.clone() });
        }
    }
    for (path, edit) in files {
        write(ctx, path, edit)?;
    }
    Ok(())
}
