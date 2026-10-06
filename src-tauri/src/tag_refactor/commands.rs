use std::collections::HashSet;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State, WebviewWindow};

use crate::index::open_db;
use crate::index::tags::normalize_tag;
use crate::note_mutation::{commit_markdown, CommitCtx, PersistMode, SpaceChange, CHANGED_EVENT};
use crate::paths;
use crate::space::SpaceState;
use crate::space_fs::helpers::{deny_hidden_rel_path, file_mtime_ms};
use crate::tag_appearance::commands::move_tag_appearance;

use super::{rewrite_note, NoteRewrite, SkipReason, TagRefactor};

#[derive(Serialize)]
pub struct TagRefactorNote {
    pub path: String,
    pub mtime_ms: u64,
    pub inline_count: usize,
    pub frontmatter_count: usize,
}

#[derive(Serialize)]
pub struct TagRefactorFailure {
    pub path: String,
    pub reason: SkipReason,
    /// Underlying error text, only for `SkipReason::Io`.
    pub detail: Option<String>,
}

impl TagRefactorFailure {
    fn new(path: String, reason: SkipReason) -> Self {
        Self {
            path,
            reason,
            detail: None,
        }
    }

    fn io(path: String, detail: String) -> Self {
        Self {
            path,
            reason: SkipReason::Io,
            detail: Some(detail),
        }
    }
}

#[derive(Serialize)]
pub struct TagRefactorPlan {
    pub notes: Vec<TagRefactorNote>,
    pub descendant_tags: Vec<String>,
    /// Target tags that already exist, so the rename merges into them.
    pub conflicts: Vec<String>,
    pub failures: Vec<TagRefactorFailure>,
}

#[derive(Deserialize)]
pub struct PlannedNote {
    pub path: String,
    pub mtime_ms: u64,
}

#[derive(Serialize)]
pub struct TagRefactorResult {
    pub changed_paths: Vec<String>,
    pub failures: Vec<TagRefactorFailure>,
    pub icon_error: Option<String>,
}

/// Every note path carrying the tag; parent rows make descendants match too.
fn tagged_note_paths(conn: &Connection, tag: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT n.path FROM tags t JOIN notes n ON n.id = t.note_id
             WHERE t.tag = ?1 ORDER BY n.path",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([tag], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn descendant_tags(conn: &Connection, tag: &str) -> Result<Vec<String>, String> {
    // `0` sorts right after `/`, so this range is exactly the `tag/` prefix and uses the index.
    let mut stmt = conn
        .prepare("SELECT DISTINCT tag FROM tags WHERE tag > ?1 AND tag < ?2 ORDER BY tag")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![format!("{tag}/"), format!("{tag}0")], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn tag_exists(conn: &Connection, tag: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM tags WHERE tag = ?1 LIMIT 1",
        params![tag],
        |_| Ok(()),
    )
    .optional()
    .map(|row| row.is_some())
    .map_err(|e| e.to_string())
}

/// Reads a note and rewrites it in memory, returning the mtime it was read at.
fn rewrite_from_disk(
    root: &Path,
    path: &str,
    refactor: &TagRefactor,
) -> Result<(u64, NoteRewrite), TagRefactorFailure> {
    let read = || -> Result<(u64, String), String> {
        let rel = PathBuf::from(path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(root, &rel)?;
        let mtime = file_mtime_ms(&abs);
        let markdown = std::fs::read_to_string(&abs).map_err(|e| e.to_string())?;
        Ok((mtime, markdown))
    };
    let (mtime, markdown) = read().map_err(|error| TagRefactorFailure::io(path.into(), error))?;
    let rewrite = rewrite_note(&markdown, refactor)
        .map_err(|reason| TagRefactorFailure::new(path.into(), reason))?;
    Ok((mtime, rewrite))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn tag_refactor_plan(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    from: String,
    to: Option<String>,
) -> Result<TagRefactorPlan, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let refactor = TagRefactor::new(&from, to.as_deref())?;
        let conn = open_db(&root)?;
        let descendants = descendant_tags(&conn, refactor.from())?;
        let mut conflicts = Vec::new();
        for tag in std::iter::once(refactor.from()).chain(descendants.iter().map(String::as_str)) {
            let mapped = refactor.map(tag).flatten();
            if let Some(mapped) = mapped.as_deref().and_then(normalize_tag) {
                if tag_exists(&conn, &mapped)? {
                    conflicts.push(mapped);
                }
            }
        }
        let mut plan = TagRefactorPlan {
            notes: Vec::new(),
            descendant_tags: descendants,
            conflicts,
            failures: Vec::new(),
        };
        for path in tagged_note_paths(&conn, refactor.from())? {
            match rewrite_from_disk(&root, &path, &refactor) {
                Ok((mtime_ms, rewrite)) if rewrite.changed() => plan.notes.push(TagRefactorNote {
                    path,
                    mtime_ms,
                    inline_count: rewrite.inline_count,
                    frontmatter_count: rewrite.frontmatter_count,
                }),
                Ok(_) => {}
                Err(failure) => plan.failures.push(failure),
            }
        }
        Ok(plan)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Rewrites exactly the previewed notes; anything that changed since the preview is skipped.
#[tauri::command(rename_all = "snake_case")]
pub async fn tag_refactor_apply(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    from: String,
    to: Option<String>,
    notes: Vec<PlannedNote>,
    expected_space: String,
) -> Result<TagRefactorResult, String> {
    let root = state.root_for_window(&window)?;
    let space_path = root.to_string_lossy().to_string();
    if space_path != expected_space {
        return Err("Space changed before refactoring the tag".to_string());
    }
    let emit_space_path = space_path.clone();
    let recent = state.recent_local_changes_for_window(window.label());
    let note_mutation_mutex = state.note_mutation_mutex();
    let (result, changes) = tauri::async_runtime::spawn_blocking(move || {
        let refactor = TagRefactor::new(&from, to.as_deref())?;
        let _note_guard = note_mutation_mutex
            .lock()
            .map_err(|_| "note mutation mutex poisoned".to_string())?;
        let conn = open_db(&root)?;
        let planned = notes
            .iter()
            .map(|note| note.path.as_str())
            .collect::<HashSet<_>>();
        let mut failures = tagged_note_paths(&conn, refactor.from())?
            .into_iter()
            .filter(|path| !planned.contains(path.as_str()))
            .map(|path| TagRefactorFailure::new(path, SkipReason::NotInPreview))
            .collect::<Vec<_>>();
        let ctx = CommitCtx {
            root: &root,
            recent: &recent,
            space_path: &space_path,
        };
        let mut changed_paths = Vec::new();
        let mut changes = Vec::new();
        for note in notes {
            let (mtime, rewrite) = match rewrite_from_disk(&root, &note.path, &refactor) {
                Ok((mtime, _)) if mtime != note.mtime_ms => {
                    failures.push(TagRefactorFailure::new(
                        note.path,
                        SkipReason::ChangedSincePreview,
                    ));
                    continue;
                }
                Ok(read) => read,
                Err(failure) => {
                    failures.push(failure);
                    continue;
                }
            };
            if !rewrite.changed() {
                continue;
            }
            let mode = PersistMode::Replace {
                expected_mtime_ms: Some(mtime),
            };
            match commit_markdown(&ctx, &note.path, &rewrite.markdown, mode) {
                Ok(committed) => {
                    changes.push(committed.change);
                    changed_paths.push(note.path);
                }
                Err(error) if error.starts_with("conflict:") => failures.push(
                    TagRefactorFailure::new(note.path, SkipReason::ChangedSincePreview),
                ),
                Err(error) => failures.push(TagRefactorFailure::io(note.path, error)),
            }
        }
        // With failures the old tag survives somewhere, so its icon stays too.
        let icon_error = if changed_paths.is_empty() {
            None
        } else {
            move_tag_appearance(&root, &refactor, !failures.is_empty()).err()
        };
        Ok::<_, String>((
            TagRefactorResult {
                changed_paths,
                failures,
                icon_error,
            },
            changes,
        ))
    })
    .await
    .map_err(|e| e.to_string())??;
    if !changes.is_empty() {
        // Each window filters this typed event by space_path.
        let _ = app.emit(CHANGED_EVENT, SpaceChange::batch(emit_space_path, changes));
    }
    Ok(result)
}
