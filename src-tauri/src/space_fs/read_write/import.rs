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

fn validate_source(source: &Path, target_abs: &Path) -> Result<PathBuf, String> {
    if !source.is_absolute() {
        return Err("import source path must be absolute".to_string());
    }
    let source_metadata = std::fs::symlink_metadata(source).map_err(|error| error.to_string())?;
    if source_metadata.file_type().is_symlink() {
        return Err("symbolic links cannot be imported".to_string());
    }
    let canonical = source.canonicalize().map_err(|error| error.to_string())?;
    let metadata = std::fs::symlink_metadata(&canonical).map_err(|error| error.to_string())?;
    if !metadata.is_file() && !metadata.is_dir() {
        return Err("import source must be a file or folder".to_string());
    }
    if metadata.is_dir() && target_abs.starts_with(&canonical) {
        return Err("a folder cannot be imported into itself".to_string());
    }
    Ok(canonical)
}

fn plan_import(
    root: &Path,
    source_paths: &[String],
    target_dir: &str,
) -> Result<Vec<ImportRoot>, String> {
    if source_paths.is_empty() {
        return Err("at least one import source is required".to_string());
    }

    let target_rel = PathBuf::from(target_dir);
    deny_hidden_rel_path(&target_rel)?;
    let target_abs = paths::join_under(root, &target_rel)?;
    if !target_abs.is_dir() {
        return Err("import destination must be an existing folder".to_string());
    }
    let canonical_target = target_abs
        .canonicalize()
        .map_err(|error| error.to_string())?;

    source_paths
        .iter()
        .map(|source_path| {
            let source_abs = validate_source(Path::new(source_path), &canonical_target)?;
            let destination_rel = target_rel.join(source_file_name(&source_abs)?);
            deny_hidden_rel_path(&destination_rel)?;
            Ok(ImportRoot {
                source_abs,
                destination_rel,
            })
        })
        .collect()
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

fn copy_source(
    root: &Path,
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
    if metadata.is_dir() {
        if destination_abs.exists() && !destination_abs.is_dir() {
            return Err(format!(
                "a file blocks the import destination: {}",
                utils::to_slash(destination_rel)
            ));
        }
        std::fs::create_dir_all(&destination_abs).map_err(|error| error.to_string())?;
        for entry in std::fs::read_dir(source).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let child_source = entry.path();
            if should_skip_source_entry(&child_source) {
                continue;
            }
            copy_source(
                root,
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

    mark_recent_local_change(recent_local_changes, &rel_path);
    match std::fs::read_to_string(&destination_abs) {
        Ok(markdown) => {
            if let Err(error) = index::index_note(root, &rel_path, &markdown) {
                tracing::warn!(
                    note_id = %rel_path,
                    error = %error,
                    "failed to index imported markdown note"
                );
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
        let imports = plan_import(&root_for_import, &source_paths, &target_dir)?;
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
            let has_conflict = requested_abs.exists() || reserved.contains(&requested_key);
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
                    ImportConflictPolicy::Replace => import.destination_rel,
                    ImportConflictPolicy::Skip => continue,
                }
            };
            reserved.insert(path_key(&destination_rel));
            copy_source(
                &root_for_import,
                &import.source_abs,
                &destination_rel,
                &recent_local_changes,
                &mut imported_count,
                &mut markdown_paths,
            )?;
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
