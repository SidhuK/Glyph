use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::space::state::{mark_recent_local_change, RecentLocalChanges};
use crate::space_fs::helpers::{deny_hidden_rel_path, etag_for, file_mtime_ms};
use crate::{index, io_atomic, paths, utils};

pub const CHANGED_EVENT: &str = "space:fs_changed";

#[derive(Clone, Debug, Deserialize, Hash, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SpaceChange {
    Content {
        space_path: String,
        rel_path: String,
    },
    Create {
        space_path: String,
        rel_path: String,
    },
    Remove {
        space_path: String,
        rel_path: String,
        recursive: bool,
    },
    Rename {
        space_path: String,
        from_path: String,
        to_path: String,
        recursive: bool,
    },
    Batch {
        space_path: String,
        changes: Vec<SpaceChange>,
    },
}

impl SpaceChange {
    pub fn content(space_path: impl Into<String>, rel_path: impl Into<String>) -> Self {
        Self::Content {
            space_path: space_path.into(),
            rel_path: rel_path.into(),
        }
    }

    pub fn create(space_path: impl Into<String>, rel_path: impl Into<String>) -> Self {
        Self::Create {
            space_path: space_path.into(),
            rel_path: rel_path.into(),
        }
    }

    pub fn remove(
        space_path: impl Into<String>,
        rel_path: impl Into<String>,
        recursive: bool,
    ) -> Self {
        Self::Remove {
            space_path: space_path.into(),
            rel_path: rel_path.into(),
            recursive,
        }
    }

    pub fn rename(
        space_path: impl Into<String>,
        from_path: impl Into<String>,
        to_path: impl Into<String>,
        recursive: bool,
    ) -> Self {
        Self::Rename {
            space_path: space_path.into(),
            from_path: from_path.into(),
            to_path: to_path.into(),
            recursive,
        }
    }

    pub fn batch(space_path: impl Into<String>, changes: Vec<SpaceChange>) -> Self {
        Self::Batch {
            space_path: space_path.into(),
            changes,
        }
    }

    pub fn contents(space_path: &str, rel_paths: impl IntoIterator<Item = impl Into<String>>) -> Self {
        Self::batch(
            space_path,
            rel_paths
                .into_iter()
                .map(|rel_path| Self::content(space_path, rel_path))
                .collect(),
        )
    }
}

pub fn emit_changed(app: &AppHandle, window_label: &str, change: &SpaceChange) {
    let _ = app.emit_to(window_label, CHANGED_EVENT, change);
}

pub struct CommitCtx<'a> {
    pub root: &'a Path,
    pub recent: &'a RecentLocalChanges,
    pub space_path: &'a str,
}

pub enum PersistMode {
    Replace { expected_mtime_ms: Option<u64> },
    CreateNew,
}

pub struct CommitResult {
    pub etag: String,
    pub mtime_ms: u64,
    pub change: SpaceChange,
    pub created: bool,
}

pub fn index_written_markdown(
    root: &Path,
    recent: &RecentLocalChanges,
    rel_path: &str,
    markdown: &str,
) {
    match index::index_note(root, rel_path, markdown) {
        Ok(()) => mark_recent_local_change(recent, rel_path),
        Err(error) => {
            tracing::warn!(note_id = %rel_path, %error, "saved note could not be indexed")
        }
    }
}

pub fn commit_markdown(
    ctx: &CommitCtx<'_>,
    rel_path: &str,
    text: &str,
    mode: PersistMode,
) -> Result<CommitResult, String> {
    let rel = PathBuf::from(rel_path);
    deny_hidden_rel_path(&rel)?;
    if !utils::is_markdown_path(&rel) {
        return Err("note mutation requires a Markdown path".to_string());
    }
    let rel_path = rel.to_string_lossy().into_owned();
    let abs = paths::join_under(ctx.root, &rel)?;
    let existed = abs.exists();
    if let PersistMode::Replace {
        expected_mtime_ms: Some(expected),
    } = mode
    {
        let actual = file_mtime_ms(&abs);
        if actual == 0 || actual != expected {
            return Err("conflict: on-disk file changed since it was opened".to_string());
        }
    }
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let bytes = text.as_bytes();
    let created = match mode {
        PersistMode::Replace { .. } => {
            io_atomic::write_atomic(&abs, bytes).map_err(|error| error.to_string())?;
            !existed
        }
        PersistMode::CreateNew => {
            if existed || !io_atomic::write_atomic_create_new(&abs, bytes).map_err(|e| e.to_string())?
            {
                let bytes = std::fs::read(&abs).unwrap_or_default();
                return Ok(CommitResult {
                    etag: etag_for(&bytes),
                    mtime_ms: file_mtime_ms(&abs),
                    change: SpaceChange::content(ctx.space_path, rel_path),
                    created: false,
                });
            }
            true
        }
    };
    index_written_markdown(ctx.root, ctx.recent, &rel_path, text);
    Ok(CommitResult {
        etag: etag_for(bytes),
        mtime_ms: file_mtime_ms(&abs),
        change: if created {
            SpaceChange::create(ctx.space_path, rel_path)
        } else {
            SpaceChange::content(ctx.space_path, rel_path)
        },
        created,
    })
}

fn dir_prefix(rel_path: &str) -> String {
    if rel_path.ends_with('/') {
        rel_path.to_string()
    } else {
        format!("{rel_path}/")
    }
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn like_descendants_pattern(rel_path: &str) -> String {
    format!("{}%", escape_like(&dir_prefix(rel_path)))
}

fn mark_if_indexed(recent: &RecentLocalChanges, rel_path: &str, ok: bool) {
    if ok {
        mark_recent_local_change(recent, rel_path);
    }
}

pub fn unindex_path(
    root: &Path,
    rel_path: &str,
    abs_path: &Path,
    recent: &RecentLocalChanges,
    is_dir: bool,
) {
    if is_dir {
        if let Ok(conn) = index::open_db(root) {
            if let Ok(mut stmt) =
                conn.prepare("SELECT id FROM notes WHERE id = ? OR id LIKE ? ESCAPE '\\'")
            {
                let pattern = like_descendants_pattern(rel_path);
                if let Ok(rows) =
                    stmt.query_map([rel_path, pattern.as_str()], |row| row.get::<_, String>(0))
                {
                    for note_id in rows.filter_map(|row| row.ok()) {
                        mark_if_indexed(recent, &note_id, index::remove_note(root, &note_id).is_ok());
                    }
                }
            }
        }
        mark_recent_local_change(recent, rel_path);
        return;
    }
    if utils::is_markdown_path(abs_path) {
        mark_if_indexed(recent, rel_path, index::remove_note(root, rel_path).is_ok());
    } else {
        mark_recent_local_change(recent, rel_path);
    }
}

pub fn reindex_after_rename(
    root: &Path,
    from_path: &str,
    to_path: &str,
    to_abs: &Path,
    is_dir: bool,
    recent: &RecentLocalChanges,
) {
    if is_dir {
        let prefix = dir_prefix(from_path);
        let new_prefix = dir_prefix(to_path);
        let Ok(conn) = index::open_db(root) else {
            return;
        };
        let Ok(mut stmt) = conn.prepare("SELECT id FROM notes WHERE id LIKE ? ESCAPE '\\'") else {
            return;
        };
        let pattern = like_descendants_pattern(from_path);
        let Ok(rows) = stmt.query_map([&pattern], |row| row.get::<_, String>(0)) else {
            return;
        };
        let old_ids: Vec<String> = rows.filter_map(|row| row.ok()).collect();
        let mut complete = true;
        for old_id in old_ids {
            let Some(suffix) = old_id.strip_prefix(prefix.as_str()) else {
                complete = false;
                continue;
            };
            let new_id = format!("{new_prefix}{suffix}");
            let removed = index::remove_note(root, &old_id).is_ok();
            mark_if_indexed(recent, &old_id, removed);
            complete &= removed;
            match std::fs::read_to_string(root.join(&new_id)) {
                Ok(markdown) => {
                    let indexed = index::index_note(root, &new_id, &markdown).is_ok();
                    mark_if_indexed(recent, &new_id, indexed);
                    complete &= indexed;
                }
                Err(_) => complete = false,
            }
        }
        if complete {
            mark_recent_local_change(recent, from_path);
            mark_recent_local_change(recent, to_path);
        }
        return;
    }
    if utils::is_markdown_path(Path::new(from_path)) {
        mark_if_indexed(
            recent,
            from_path,
            index::remove_note(root, from_path).is_ok(),
        );
    } else {
        mark_recent_local_change(recent, from_path);
    }
    if utils::is_markdown_path(to_abs) {
        if let Ok(markdown) = std::fs::read_to_string(to_abs) {
            mark_if_indexed(
                recent,
                to_path,
                index::index_note(root, to_path, &markdown).is_ok(),
            );
        }
    } else {
        mark_recent_local_change(recent, to_path);
    }
}
