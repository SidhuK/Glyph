use super::review_files::{self, FileEdit, Files, ReviewError, WriteContext};
use crate::{glyph_paths, io_atomic, paths};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

pub(super) static REVIEW_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EditStatus {
    Pending,
    Accepted,
    Rejected,
    Undone,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct NoteEdit {
    pub id: String,
    pub files: Files,
    pub status: EditStatus,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Operation {
    version: u32,
    pub created_at_ms: u64,
    pub job_id: String,
    pub thread_id: String,
    pub immediate: bool,
    pub finished: bool,
    pub edits: Vec<NoteEdit>,
    pub(super) transaction: Option<Files>,
}

fn location(root: &Path, id: &str) -> Result<PathBuf, ReviewError> {
    uuid::Uuid::parse_str(id).map_err(|e| e.to_string())?;
    paths::join_under(
        &glyph_paths::ai_history_dir(root)?,
        Path::new(&format!("edits/{id}.json")),
    )
    .map_err(ReviewError::from)
}

fn save(root: &Path, op: &Operation) -> Result<(), ReviewError> {
    let path = location(root, &op.job_id)?;
    fs::create_dir_all(path.parent().ok_or(ReviewError::InvalidOperation)?)
        .map_err(|e| e.to_string())?;
    io_atomic::write_atomic(&path, &serde_json::to_vec(op).map_err(|e| e.to_string())?)
        .map_err(|e| ReviewError::from(e.to_string()))
}

pub(super) fn load(root: &Path, id: &str) -> Result<Operation, ReviewError> {
    let op: Operation =
        serde_json::from_slice(&fs::read(location(root, id)?).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    if op.version != 1 || op.job_id != id {
        return Err(ReviewError::InvalidOperation);
    }
    Ok(op)
}

pub fn begin(
    root: &Path,
    job_id: &str,
    thread_id: &str,
    immediate: bool,
) -> Result<(), ReviewError> {
    let _guard = REVIEW_LOCK.lock().map_err(|e| e.to_string())?;
    save(
        root,
        &Operation {
            version: 1,
            created_at_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_millis() as u64,
            job_id: job_id.into(),
            thread_id: thread_id.into(),
            immediate,
            finished: false,
            edits: vec![],
            transaction: None,
        },
    )
}

pub fn finish(root: &Path, id: &str) -> Result<(), ReviewError> {
    let _guard = REVIEW_LOCK.lock().map_err(|e| e.to_string())?;
    let mut op = load(root, id)?;
    op.finished = true;
    save(root, &op)
}

fn projected(root: &Path, op: &Operation, path: &str) -> Result<Option<String>, ReviewError> {
    for edit in &op.edits {
        if matches!(edit.status, EditStatus::Pending | EditStatus::Accepted) {
            if let Some(file) = edit.files.get(path) {
                return Ok(file.after.clone());
            }
        }
    }
    review_files::read(root, path)
}

pub fn read(root: &Path, id: &str, path: &str) -> Result<Option<String>, ReviewError> {
    let _guard = REVIEW_LOCK.lock().map_err(|e| e.to_string())?;
    projected(root, &load(root, id)?, path)
}

pub enum Proposal {
    Write {
        path: String,
        text: String,
        create_only: bool,
    },
    Patch {
        path: String,
        find: String,
        replace: String,
        all: bool,
    },
    Move {
        src: String,
        dest: String,
    },
    Delete {
        path: String,
    },
}

pub(super) fn recover(ctx: &WriteContext<'_>, op: &mut Operation) -> Result<(), ReviewError> {
    if let Some(files) = &op.transaction {
        review_files::apply(ctx, files)?;
        op.transaction = None;
        save(ctx.root, op)?;
    }
    Ok(())
}

pub(super) fn commit(
    ctx: &WriteContext<'_>,
    op: &mut Operation,
    files: Files,
) -> Result<(), ReviewError> {
    review_files::validate(ctx.root, &files)?;
    op.transaction = Some(files);
    save(ctx.root, op)?;
    recover(ctx, op)
}

pub fn propose(
    ctx: &WriteContext<'_>,
    id: &str,
    proposal: Proposal,
    cancel: &tokio_util::sync::CancellationToken,
) -> Result<String, ReviewError> {
    let _guard = REVIEW_LOCK.lock().map_err(|e| e.to_string())?;
    if cancel.is_cancelled() {
        return Err(ReviewError::Cancelled);
    }
    let mut op = load(ctx.root, id)?;
    if op.finished {
        return Err(ReviewError::InvalidOperation);
    }
    if op.transaction.is_some() {
        return Err(ReviewError::RecoveryRequired);
    }
    let mut updates = std::collections::BTreeMap::new();
    match proposal {
        Proposal::Write {
            path,
            text,
            create_only,
        } => {
            if create_only && projected(ctx.root, &op, &path)?.is_some() {
                return Err(ReviewError::FileExists);
            }
            updates.insert(path, Some(text));
        }
        Proposal::Patch {
            path,
            find,
            replace,
            all,
        } => {
            if find.is_empty() {
                return Err(ReviewError::PatchMismatch);
            }
            let before = projected(ctx.root, &op, &path)?.ok_or(ReviewError::FileNotFound)?;
            if !before.contains(&find) {
                return Err(ReviewError::PatchMismatch);
            }
            let after = if all {
                before.replace(&find, &replace)
            } else {
                before.replacen(&find, &replace, 1)
            };
            updates.insert(path, Some(after));
        }
        Proposal::Move { src, dest } => {
            if src == dest
                || op.edits.iter().any(|edit| edit.files.contains_key(&dest))
                || projected(ctx.root, &op, &dest)?.is_some()
            {
                return Err(ReviewError::FileExists);
            }
            let text = projected(ctx.root, &op, &src)?.ok_or(ReviewError::FileNotFound)?;
            updates.insert(src, None);
            updates.insert(dest, Some(text));
        }
        Proposal::Delete { path } => {
            projected(ctx.root, &op, &path)?.ok_or(ReviewError::FileNotFound)?;
            updates.insert(path, None);
        }
    }
    let mut transaction = Files::new();
    let mut files = Files::new();
    let changed_paths: Vec<String> = updates.keys().cloned().collect();
    for (path, after) in updates {
        if op
            .edits
            .iter()
            .flat_map(|edit| edit.files.keys())
            .any(|existing| existing != &path && existing.to_lowercase() == path.to_lowercase())
        {
            return Err(ReviewError::InvalidPath);
        }
        if after
            .as_ref()
            .is_some_and(|text| text.len() > review_files::MAX_EDIT_BYTES)
        {
            return Err(ReviewError::UnsupportedFile);
        }
        let before = projected(ctx.root, &op, &path)?;
        // Validate every path even when it already exists in the projected view.
        super::tools::safe_join(ctx.root, &path).map_err(|e| e.to_string())?;
        transaction.insert(
            path.clone(),
            FileEdit {
                before: before.clone(),
                after: after.clone(),
            },
        );
        files.insert(path, FileEdit { before, after });
    }
    let mut retained = Vec::new();
    for edit in op.edits {
        if edit.files.keys().any(|path| files.contains_key(path)) {
            for (path, previous) in edit.files {
                files
                    .entry(path)
                    .and_modify(|file| file.before = previous.before.clone())
                    .or_insert(previous);
            }
        } else {
            retained.push(edit);
        }
    }
    let edit_id = uuid::Uuid::new_v4().to_string();
    retained.push(NoteEdit {
        id: edit_id.clone(),
        files,
        status: if op.immediate {
            EditStatus::Accepted
        } else {
            EditStatus::Pending
        },
    });
    op.edits = retained;
    if cancel.is_cancelled() {
        return Err(ReviewError::Cancelled);
    }
    // Once journaled, finish the transaction even if cancellation arrives during I/O.
    if op.immediate {
        commit(ctx, &mut op, transaction)?;
    } else {
        save(ctx.root, &op)?;
    }
    Ok(serde_json::json!({"ok": true, "payload": {"operation_id": id, "edit_id": edit_id, "paths": changed_paths, "proposed": !op.immediate, "applied": op.immediate}}).to_string())
}
