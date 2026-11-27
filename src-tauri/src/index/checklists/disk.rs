use std::path::{Path, PathBuf};

use crate::note_mutation::{commit_markdown, CommitCtx, CommitResult, PersistMode, SpaceChange};
use crate::space_fs::helpers::{deny_hidden_rel_path, etag_for, file_mtime_ms};
use crate::{paths, utils};

use super::api::{
    TaskCreateRequest, TaskCreateResult, TaskEdit, TaskNoteWriteResult, TaskUpdateBatchRequest,
    TaskWriteOutcome,
};
use super::create::{canonical_task_line, insert_task_line};
use super::edit::apply_task_edits;
use super::validate::{validate_create, validate_edits};

pub(super) type Written<T> = (T, Vec<SpaceChange>);

fn note_abs_path(root: &Path, note_path: &str) -> Result<PathBuf, String> {
    let rel = PathBuf::from(note_path);
    deny_hidden_rel_path(&rel)?;
    if !utils::is_markdown_path(&rel) {
        return Err("note mutation requires a Markdown path".to_string());
    }
    paths::join_under(root, &rel)
}

fn read_note(abs: &Path) -> Result<Option<(String, u64)>, String> {
    let mtime_ms = file_mtime_ms(abs);
    match std::fs::read(abs) {
        Ok(bytes) => String::from_utf8(bytes)
            .map(|markdown| Some((markdown, mtime_ms)))
            .map_err(|e| e.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn committed_outcome(
    result: Result<CommitResult, String>,
) -> Result<(TaskWriteOutcome, Option<SpaceChange>), String> {
    match result {
        Ok(committed) if committed.index_failed => Ok((
            TaskWriteOutcome::IndexFailed {
                etag: committed.etag,
            },
            Some(committed.change),
        )),
        Ok(committed) => Ok((
            TaskWriteOutcome::Saved {
                etag: committed.etag,
            },
            Some(committed.change),
        )),
        Err(error) if error.starts_with("conflict:") => Ok((TaskWriteOutcome::Conflict, None)),
        Err(error) => Err(error),
    }
}

fn group_by_note(edits: &[TaskEdit]) -> Vec<(&str, Vec<&TaskEdit>)> {
    let mut groups: Vec<(&str, Vec<&TaskEdit>)> = Vec::new();
    for edit in edits {
        match groups.iter_mut().find(|(path, _)| *path == edit.note_path) {
            Some((_, group)) => group.push(edit),
            None => groups.push((edit.note_path.as_str(), vec![edit])),
        }
    }
    groups
}

fn update_note(
    ctx: &CommitCtx<'_>,
    note_path: &str,
    edits: &[&TaskEdit],
    today: &str,
) -> Result<(TaskWriteOutcome, Option<SpaceChange>), String> {
    let conflict = Ok((TaskWriteOutcome::Conflict, None));
    let abs = note_abs_path(ctx.root, note_path)?;
    let Some((markdown, mtime_ms)) = read_note(&abs)? else {
        return conflict;
    };
    let etag = etag_for(markdown.as_bytes());
    if edits.iter().any(|edit| edit.etag != etag) {
        return conflict;
    }
    let Ok(next) = apply_task_edits(&markdown, edits, today) else {
        return conflict;
    };
    let Some(next) = next else {
        return Ok((TaskWriteOutcome::Saved { etag }, None));
    };
    let mode = PersistMode::Replace {
        expected_mtime_ms: Some(mtime_ms),
    };
    committed_outcome(commit_markdown(ctx, note_path, &next, mode))
}

pub(super) fn update_on_disk(
    ctx: &CommitCtx<'_>,
    request: &TaskUpdateBatchRequest,
) -> Result<Written<Vec<TaskNoteWriteResult>>, String> {
    validate_edits(request)?;
    for edit in &request.edits {
        note_abs_path(ctx.root, &edit.note_path)?;
    }
    let mut results = Vec::new();
    let mut changes = Vec::new();
    for (note_path, edits) in group_by_note(&request.edits) {
        let (outcome, change) = update_note(ctx, note_path, &edits, &request.today)?;
        changes.extend(change);
        results.push(TaskNoteWriteResult {
            note_path: note_path.to_string(),
            outcome,
        });
    }
    Ok((results, changes))
}

pub(super) fn create_on_disk(
    ctx: &CommitCtx<'_>,
    request: &TaskCreateRequest,
) -> Result<Written<TaskCreateResult>, String> {
    validate_create(request)?;
    let abs = note_abs_path(ctx.root, &request.note_path)?;
    let task_line = canonical_task_line(&request.title, request.priority, request.due.as_deref());
    let (next, start, mode) = match read_note(&abs)? {
        Some((markdown, mtime_ms)) => {
            let (next, start) = insert_task_line(&markdown, &task_line);
            let mode = PersistMode::Replace {
                expected_mtime_ms: Some(mtime_ms),
            };
            (next, start, mode)
        }
        None => (format!("{task_line}\n"), 0, PersistMode::CreateNew),
    };
    let creating = matches!(mode, PersistMode::CreateNew);
    let committed = commit_markdown(ctx, &request.note_path, &next, mode);
    let (outcome, change) = match committed {
        Ok(result) if creating && !result.created => (TaskWriteOutcome::Conflict, None),
        other => committed_outcome(other)?,
    };
    let result = TaskCreateResult {
        note_path: request.note_path.clone(),
        start,
        outcome,
    };
    Ok((result, change.into_iter().collect()))
}
