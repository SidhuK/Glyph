use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};
use tauri::{Emitter, State, WebviewWindow};

use crate::space::state::{mark_recent_local_change, RecentLocalChanges};
use crate::{index, io_atomic, paths, space::SpaceState, utils};

use super::super::helpers::deny_hidden_rel_path;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportConflictPolicy {
    KeepBoth,
    Replace,
    Skip,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum SpaceImportResult {
    Conflicts {
        conflict_count: usize,
    },
    Imported {
        imported_count: usize,
        markdown_paths: Vec<String>,
    },
}

#[derive(Clone, Serialize)]
struct NoteChangeEvent {
    space_path: String,
    rel_path: String,
    removed: bool,
}

struct ImportRoot {
    source_abs: PathBuf,
    destination_rel: PathBuf,
}

fn path_key(path: &Path) -> String {
    utils::to_slash(path).to_lowercase()
}

fn source_file_name(path: &Path) -> Result<PathBuf, String> {
    path.file_name()
        .map(PathBuf::from)
        .ok_or_else(|| "import source has no file name".to_string())
}

fn ensure_within_space(canonical_root: &Path, abs: &Path) -> Result<(), String> {
    let canonical = if abs.exists() {
        abs.canonicalize().map_err(|error| error.to_string())?
    } else {
        let parent = abs
            .parent()
            .ok_or_else(|| "import destination has no parent directory".to_string())?;
        let file_name = abs
            .file_name()
            .ok_or_else(|| "import destination has no file name".to_string())?;
        parent
            .canonicalize()
            .map_err(|error| error.to_string())?
            .join(file_name)
    };
    if !canonical.starts_with(canonical_root) {
        return Err("import destination is outside the space".to_string());
    }
    Ok(())
}

fn reject_symlink(path: &Path, label: &str) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err(format!("{label} cannot be a symbolic link: {}", path.display()));
    }
    Ok(())
}

fn validate_source(source: &Path, target_abs: &Path) -> Result<PathBuf, String> {
    if !source.is_absolute() {
        return Err("import source path must be absolute".to_string());
    }
    reject_symlink(source, "import source")?;
    let canonical = source.canonicalize().map_err(|error| error.to_string())?;
    let metadata = std::fs::symlink_metadata(&canonical).map_err(|error| error.to_string())?;
    if !metadata.is_file() && !metadata.is_dir() {
        return Err("import source must be a file or folder".to_string());
    }
    if metadata.is_dir() && target_abs.starts_with(&canonical) {
        return Err("a folder cannot be imported into itself".to_string());
    }
    // Reject file→same-path imports; Replace would delete the source first.
    if metadata.is_file() {
        if let Some(name) = canonical.file_name() {
            let planned = target_abs.join(name);
            let same_path = planned == canonical
                || planned
                    .canonicalize()
                    .map(|dest| dest == canonical)
                    .unwrap_or(false);
            if same_path {
                return Err("a file cannot be imported onto itself".to_string());
            }
        }
    }
    Ok(canonical)
}

fn validate_source_tree(source: &Path) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(source).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "symbolic links cannot be imported: {}",
            source.display()
        ));
    }
    if metadata.is_dir() {
        for entry in std::fs::read_dir(source).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let child = entry.path();
            if should_skip_source_entry(&child) {
                continue;
            }
            validate_source_tree(&child)?;
        }
        return Ok(());
    }
    if metadata.is_file() {
        return Ok(());
    }
    Err(format!("unsupported import source: {}", source.display()))
}

fn plan_import(
    root: &Path,
    source_paths: &[String],
    target_dir: &str,
) -> Result<(PathBuf, Vec<ImportRoot>), String> {
    if source_paths.is_empty() {
        return Err("at least one import source is required".to_string());
    }

    let target_rel = PathBuf::from(target_dir);
    deny_hidden_rel_path(&target_rel)?;
    let target_abs = paths::join_under(root, &target_rel)?;
    reject_symlink(&target_abs, "import destination")?;
    let target_metadata =
        std::fs::symlink_metadata(&target_abs).map_err(|error| error.to_string())?;
    if !target_metadata.is_dir() {
        return Err("import destination must be an existing folder".to_string());
    }
    let canonical_root = root.canonicalize().map_err(|error| error.to_string())?;
    let canonical_target = target_abs
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !canonical_target.starts_with(&canonical_root) {
        return Err("import destination is outside the space".to_string());
    }

    let imports = source_paths
        .iter()
        .map(|source_path| {
            let source_abs = validate_source(Path::new(source_path), &canonical_target)?;
            validate_source_tree(&source_abs)?;
            let destination_rel = target_rel.join(source_file_name(&source_abs)?);
            deny_hidden_rel_path(&destination_rel)?;
            Ok(ImportRoot {
                source_abs,
                destination_rel,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok((canonical_root, imports))
}

fn count_conflicts(root: &Path, imports: &[ImportRoot]) -> Result<usize, String> {
    let mut reserved = HashSet::new();
    let mut conflict_count = 0;
    for import in imports {
        let key = path_key(&import.destination_rel);
        let destination_abs = paths::join_under(root, &import.destination_rel)?;
        if destination_abs.exists() || !reserved.insert(key) {
            conflict_count += 1;
        }
    }
    Ok(conflict_count)
}

fn next_available_path(
    root: &Path,
    requested: &Path,
    reserved: &HashSet<String>,
    preserve_extension: bool,
) -> Result<PathBuf, String> {
    let parent = requested.parent().unwrap_or_else(|| Path::new(""));
    let file_name = requested
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "import destination has no valid file name".to_string())?;
    let (stem, extension) = if preserve_extension {
        super::super::filename::split_stem_extension(file_name)
    } else {
        (file_name, "")
    };
    let base = if stem.is_empty() { file_name } else { stem };

    let mut suffix = 2;
    loop {
        let candidate = parent.join(format!("{base} {suffix}{extension}"));
        let candidate_abs = paths::join_under(root, &candidate)?;
        if !candidate_abs.exists() && !reserved.contains(&path_key(&candidate)) {
            return Ok(candidate);
        }
        suffix += 1;
    }
}

fn should_skip_source_entry(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with('.'))
}

/// Move an existing destination aside so a replacement can be written. Caller
/// must `commit` (delete backup) or `rollback` (restore) afterward.
fn move_destination_aside(root: &Path, destination_rel: &Path) -> Result<PathBuf, String> {
    let destination_abs = paths::join_under(root, destination_rel)?;
    reject_symlink(&destination_abs, "import destination")?;
    let parent = destination_abs
        .parent()
        .ok_or_else(|| "import destination has no parent directory".to_string())?;
    let file_name = destination_abs
        .file_name()
        .ok_or_else(|| "import destination has no file name".to_string())?;
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let backup_abs = parent.join(format!(
        ".{}.replace-backup.{}.{}",
        file_name.to_string_lossy(),
        std::process::id(),
        now_ms
    ));
    std::fs::rename(&destination_abs, &backup_abs).map_err(|error| error.to_string())?;
    Ok(backup_abs)
}

fn remove_path_best_effort(path: &Path) {
    let Ok(metadata) = std::fs::symlink_metadata(path) else {
        return;
    };
    if metadata.is_dir() {
        let _ = std::fs::remove_dir_all(path);
    } else {
        let _ = std::fs::remove_file(path);
    }
}

/// Drop index rows under `destination_rel` whose files no longer exist on disk.
fn purge_missing_indexed_notes(
    root: &Path,
    destination_rel: &Path,
    recent_local_changes: &RecentLocalChanges,
) {
    let rel_path = utils::to_slash(destination_rel);
    let Ok(conn) = index::open_db(root) else {
        return;
    };
    let Ok(mut stmt) = conn.prepare("SELECT id FROM notes WHERE id = ? OR id LIKE ?") else {
        return;
    };
    let pattern = format!("{rel_path}/%");
    let Ok(rows) = stmt.query_map([rel_path.as_str(), pattern.as_str()], |row| {
        row.get::<_, String>(0)
    }) else {
        return;
    };
    for note_id in rows.filter_map(|row| row.ok()) {
        let abs = root.join(&note_id);
        if abs.exists() {
            continue;
        }
        mark_recent_local_change(recent_local_changes, &note_id);
        let _ = index::remove_note(root, &note_id);
    }
}

fn reindex_markdown_tree(
    root: &Path,
    destination_rel: &Path,
    recent_local_changes: &RecentLocalChanges,
) {
    let Ok(destination_abs) = paths::join_under(root, destination_rel) else {
        return;
    };
    let Ok(metadata) = std::fs::symlink_metadata(&destination_abs) else {
        return;
    };
    if metadata.is_dir() {
        let Ok(entries) = std::fs::read_dir(&destination_abs) else {
            return;
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            if name.to_str().is_some_and(|n| n.starts_with('.')) {
                continue;
            }
            reindex_markdown_tree(
                root,
                &destination_rel.join(name),
                recent_local_changes,
            );
        }
        return;
    }
    if !utils::is_markdown_path(destination_rel) {
        return;
    }
    let rel_path = utils::to_slash(destination_rel);
    let Ok(markdown) = std::fs::read_to_string(&destination_abs) else {
        return;
    };
    if index::index_note(root, &rel_path, &markdown).is_ok() {
        mark_recent_local_change(recent_local_changes, &rel_path);
    }
}

fn finalize_replace_backup(
    root: &Path,
    destination_rel: &Path,
    destination_abs: &Path,
    backup_abs: PathBuf,
    recent_local_changes: &RecentLocalChanges,
    copy_result: Result<(), String>,
) -> Result<(), String> {
    match copy_result {
        Ok(()) => {
            remove_path_best_effort(&backup_abs);
            purge_missing_indexed_notes(root, destination_rel, recent_local_changes);
            Ok(())
        }
        Err(error) => {
            if destination_abs.exists() {
                remove_path_best_effort(destination_abs);
            }
            if let Err(restore_error) = std::fs::rename(&backup_abs, destination_abs) {
                return Err(format!(
                    "{error}; also failed to restore original: {restore_error}"
                ));
            }
            // Partial copy may have reindexed paths; restore on-disk content to the index.
            purge_missing_indexed_notes(root, destination_rel, recent_local_changes);
            reindex_markdown_tree(root, destination_rel, recent_local_changes);
            Err(error)
        }
    }
}

fn copy_source(
    root: &Path,
    canonical_root: &Path,
    source: &Path,
    destination_rel: &Path,
    recent_local_changes: &RecentLocalChanges,
    imported_count: &mut usize,
    markdown_paths: &mut Vec<String>,
) -> Result<(), String> {
    deny_hidden_rel_path(destination_rel)?;
    let metadata = std::fs::symlink_metadata(source).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "symbolic links cannot be imported: {}",
            source.display()
        ));
    }

    let destination_abs = paths::join_under(root, destination_rel)?;
    if destination_abs.exists() {
        reject_symlink(&destination_abs, "import destination")?;
    }
    ensure_within_space(canonical_root, &destination_abs)?;

    if metadata.is_dir() {
        if destination_abs.exists() && !destination_abs.is_dir() {
            return Err(format!(
                "a file blocks the import destination: {}",
                utils::to_slash(destination_rel)
            ));
        }
        std::fs::create_dir_all(&destination_abs).map_err(|error| error.to_string())?;
        ensure_within_space(canonical_root, &destination_abs)?;
        for entry in std::fs::read_dir(source).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let child_source = entry.path();
            if should_skip_source_entry(&child_source) {
                continue;
            }
            copy_source(
                root,
                canonical_root,
                &child_source,
                &destination_rel.join(entry.file_name()),
                recent_local_changes,
                imported_count,
                markdown_paths,
            )?;
        }
        return Ok(());
    }

    if !metadata.is_file() {
        return Err(format!("unsupported import source: {}", source.display()));
    }
    if destination_abs.is_dir() {
        return Err(format!(
            "a folder blocks the import destination: {}",
            utils::to_slash(destination_rel)
        ));
    }

    io_atomic::copy_atomic(source, &destination_abs).map_err(|error| error.to_string())?;
    let rel_path = utils::to_slash(destination_rel);
    *imported_count += 1;
    if !utils::is_markdown_path(destination_rel) {
        return Ok(());
    }

    // Only suppress the watcher after a successful index (same as text writes).
    match std::fs::read_to_string(&destination_abs) {
        Ok(markdown) => {
            if let Err(error) = index::index_note(root, &rel_path, &markdown) {
                tracing::warn!(
                    note_id = %rel_path,
                    error = %error,
                    "failed to index imported markdown note"
                );
            } else {
                mark_recent_local_change(recent_local_changes, &rel_path);
            }
        }
        Err(error) => {
            tracing::warn!(
                note_id = %rel_path,
                error = %error,
                "failed to read imported markdown note for indexing"
            );
        }
    }
    markdown_paths.push(rel_path);
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_import_paths(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    source_paths: Vec<String>,
    target_dir: String,
    conflict_policy: Option<ImportConflictPolicy>,
) -> Result<SpaceImportResult, String> {
    let root = state.root_for_window(&window)?;
    let recent_local_changes = state.recent_local_changes_for_window(window.label());
    let note_mutation_mutex = state.note_mutation_mutex();
    let root_for_import = root.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = note_mutation_mutex
            .lock()
            .map_err(|_| "note mutation mutex poisoned".to_string())?;
        let (canonical_root, imports) =
            plan_import(&root_for_import, &source_paths, &target_dir)?;
        let conflict_count = count_conflicts(&root_for_import, &imports)?;
        if conflict_count > 0 && conflict_policy.is_none() {
            return Ok(SpaceImportResult::Conflicts { conflict_count });
        }

        let policy = conflict_policy.unwrap_or(ImportConflictPolicy::KeepBoth);
        let mut reserved = HashSet::new();
        let mut imported_count = 0;
        let mut markdown_paths = Vec::new();

        for import in imports {
            let requested_key = path_key(&import.destination_rel);
            let requested_abs = paths::join_under(&root_for_import, &import.destination_rel)?;
            let claimed_in_batch = reserved.contains(&requested_key);
            let exists_on_disk = requested_abs.exists();
            let has_conflict = exists_on_disk || claimed_in_batch;

            // Within-batch basename collisions must not clobber an earlier import
            // from this same command — even under Replace.
            let destination_rel = if !has_conflict {
                import.destination_rel
            } else {
                match policy {
                    ImportConflictPolicy::KeepBoth => next_available_path(
                        &root_for_import,
                        &import.destination_rel,
                        &reserved,
                        import.source_abs.is_file(),
                    )?,
                    ImportConflictPolicy::Replace if claimed_in_batch => next_available_path(
                        &root_for_import,
                        &import.destination_rel,
                        &reserved,
                        import.source_abs.is_file(),
                    )?,
                    ImportConflictPolicy::Replace => import.destination_rel,
                    ImportConflictPolicy::Skip => continue,
                }
            };

            // File→file: leave dest in place; copy_atomic renames over it.
            // Dir / type-mismatch: move aside, copy, then commit or restore.
            let replace_backup = if matches!(policy, ImportConflictPolicy::Replace)
                && !claimed_in_batch
                && exists_on_disk
            {
                let dest_meta = std::fs::symlink_metadata(&requested_abs)
                    .map_err(|error| error.to_string())?;
                let source_meta = std::fs::symlink_metadata(&import.source_abs)
                    .map_err(|error| error.to_string())?;
                if dest_meta.is_dir() || source_meta.is_dir() {
                    Some(move_destination_aside(
                        &root_for_import,
                        &destination_rel,
                    )?)
                } else {
                    None
                }
            } else {
                None
            };

            reserved.insert(path_key(&destination_rel));
            let destination_abs = paths::join_under(&root_for_import, &destination_rel)?;
            let copy_result = copy_source(
                &root_for_import,
                &canonical_root,
                &import.source_abs,
                &destination_rel,
                &recent_local_changes,
                &mut imported_count,
                &mut markdown_paths,
            );
            if let Some(backup_abs) = replace_backup {
                finalize_replace_backup(
                    &root_for_import,
                    &destination_rel,
                    &destination_abs,
                    backup_abs,
                    &recent_local_changes,
                    copy_result,
                )?;
            } else {
                copy_result?;
            }
        }

        Ok::<_, String>(SpaceImportResult::Imported {
            imported_count,
            markdown_paths,
        })
    })
    .await
    .map_err(|error| error.to_string())??;

    if let SpaceImportResult::Imported { markdown_paths, .. } = &result {
        let window_label = window.label().to_string();
        let space_path = root.to_string_lossy().to_string();
        for rel_path in markdown_paths {
            let _ = app.emit_to(
                &window_label,
                "notes:external_changed",
                NoteChangeEvent {
                    space_path: space_path.clone(),
                    rel_path: rel_path.clone(),
                    removed: false,
                },
            );
        }
    }

    Ok(result)
}
