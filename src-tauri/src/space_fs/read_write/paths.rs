use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};
use tauri::State;

use crate::space::state::{mark_recent_local_change, RecentLocalChanges};
use crate::{index, paths, space::SpaceState, utils};

use super::super::helpers::deny_hidden_rel_path;
use super::super::types::FsEntry;
use super::trash::move_path_to_trash;

fn split_duplicate_name(file_name: &str) -> (&str, &str) {
    match file_name.rfind('.') {
        Some(index) if index > 0 => (&file_name[..index], &file_name[index..]),
        _ => (file_name, ""),
    }
}

fn next_duplicate_file_name(existing_names: &HashSet<String>, file_name: &str) -> String {
    let (stem, ext) = split_duplicate_name(file_name);
    let base_name = if stem.is_empty() { file_name } else { stem };
    let first_candidate = format!("{base_name} Copy{ext}");
    if !existing_names.contains(&first_candidate.to_lowercase()) {
        return first_candidate;
    }

    let mut index = 2;
    loop {
        let candidate = format!("{base_name} Copy {index}{ext}");
        if !existing_names.contains(&candidate.to_lowercase()) {
            return candidate;
        }
        index += 1;
    }
}

fn load_sibling_names(parent_abs: &Path) -> Result<HashSet<String>, String> {
    let entries = std::fs::read_dir(parent_abs).map_err(|e| e.to_string())?;
    let mut names = HashSet::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        names.insert(entry.file_name().to_string_lossy().to_lowercase());
    }
    Ok(names)
}

fn duplicate_reservation_path(duplicate_abs: &Path) -> Result<PathBuf, String> {
    let parent = duplicate_abs
        .parent()
        .ok_or_else(|| "invalid path: missing parent".to_string())?;
    let file_name = duplicate_abs
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .ok_or_else(|| "invalid path: missing file name".to_string())?;
    Ok(parent.join(format!(".{file_name}.duplicate.lock")))
}

struct DuplicateReservation {
    lock_abs: PathBuf,
}

impl DuplicateReservation {
    fn create(lock_abs: PathBuf) -> Result<Self, std::io::Error> {
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&lock_abs)?;
        Ok(Self { lock_abs })
    }
}

impl Drop for DuplicateReservation {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.lock_abs);
    }
}

fn build_file_entry(rel_path: &Path, is_markdown: bool) -> Result<FsEntry, String> {
    let name = rel_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .ok_or_else(|| "invalid path: missing file name".to_string())?;
    Ok(FsEntry {
        name,
        rel_path: utils::to_slash(rel_path),
        kind: "file".to_string(),
        is_markdown,
    })
}

fn duplicate_file_under_root(
    root: &Path,
    rel_path: &Path,
    recent_local_changes: &RecentLocalChanges,
) -> Result<FsEntry, String> {
    if rel_path.as_os_str().is_empty() {
        return Err("path is required".to_string());
    }
    deny_hidden_rel_path(rel_path)?;

    let source_abs = paths::join_under(root, rel_path)?;
    let source_meta = std::fs::metadata(&source_abs).map_err(|e| e.to_string())?;
    if source_meta.is_dir() {
        return Err("directories cannot be duplicated".to_string());
    }
    if !source_meta.is_file() {
        return Err("source path is not a file".to_string());
    }

    let file_name = rel_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .ok_or_else(|| "invalid path: missing file name".to_string())?;
    let parent_rel = rel_path.parent().unwrap_or_else(|| Path::new(""));
    let parent_abs = paths::join_under(root, parent_rel)?;
    let mut unavailable_names = load_sibling_names(&parent_abs)?;

    loop {
        let duplicate_name = next_duplicate_file_name(&unavailable_names, &file_name);
        let duplicate_rel = if parent_rel.as_os_str().is_empty() {
            PathBuf::from(&duplicate_name)
        } else {
            parent_rel.join(&duplicate_name)
        };
        let duplicate_abs = paths::join_under(root, &duplicate_rel)?;
        let reservation_abs = duplicate_reservation_path(&duplicate_abs)?;
        let _reservation = match DuplicateReservation::create(reservation_abs) {
            Ok(reservation) => reservation,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                unavailable_names.insert(duplicate_name.to_lowercase());
                continue;
            }
            Err(error) => return Err(error.to_string()),
        };

        if duplicate_abs.exists() {
            unavailable_names.insert(duplicate_name.to_lowercase());
            continue;
        }

        let is_markdown = utils::is_markdown_path(&duplicate_rel);
        crate::io_atomic::copy_atomic(&source_abs, &duplicate_abs).map_err(|e| e.to_string())?;

        let duplicate_rel_string = utils::to_slash(&duplicate_rel);
        if is_markdown {
            mark_recent_local_change(recent_local_changes, &duplicate_rel_string);
            match std::fs::read_to_string(&duplicate_abs) {
                Ok(markdown) => {
                    if let Err(error) = index::index_note(root, &duplicate_rel_string, &markdown) {
                        tracing::warn!(
                            note_id = %duplicate_rel_string,
                            error = %error,
                            "failed to index duplicated markdown note"
                        );
                    }
                }
                Err(error) => {
                    tracing::warn!(
                        note_id = %duplicate_rel_string,
                        error = %error,
                        "failed to read duplicated markdown note for indexing"
                    );
                }
            }
        }

        return build_file_entry(&duplicate_rel, is_markdown);
    }
}

fn remove_markdown_notes_from_index(
    root: &Path,
    rel_path: &str,
    abs_path: &Path,
    recent_local_changes: &RecentLocalChanges,
    is_dir: bool,
) {
    if is_dir {
        let prefix = if rel_path.ends_with('/') {
            rel_path.to_string()
        } else {
            format!("{rel_path}/")
        };
        if let Ok(conn) = index::open_db(root) {
            if let Ok(mut stmt) = conn.prepare("SELECT id FROM notes WHERE id = ? OR id LIKE ?") {
                let pattern = format!("{prefix}%");
                if let Ok(rows) =
                    stmt.query_map([rel_path, pattern.as_str()], |row| row.get::<_, String>(0))
                {
                    for note_id in rows.filter_map(|row| row.ok()) {
                        mark_recent_local_change(recent_local_changes, &note_id);
                        let _ = index::remove_note(root, &note_id);
                    }
                }
            }
        }
        return;
    }

    if utils::is_markdown_path(abs_path) {
        mark_recent_local_change(recent_local_changes, rel_path);
        let _ = index::remove_note(root, rel_path);
    }
}

#[tauri::command]
pub async fn space_create_dir(state: State<'_, SpaceState>, path: String) -> Result<(), String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let rel = PathBuf::from(&path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        std::fs::create_dir_all(abs).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_duplicate_path(
    state: State<'_, SpaceState>,
    path: String,
) -> Result<FsEntry, String> {
    let root = state.current_root()?;
    let recent_local_changes = state.recent_local_changes();
    tauri::async_runtime::spawn_blocking(move || {
        duplicate_file_under_root(&root, Path::new(&path), &recent_local_changes)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn space_resolve_abs_path(
    state: State<'_, SpaceState>,
    path: String,
) -> Result<String, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let rel = PathBuf::from(&path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        if !abs.exists() {
            return Err("path does not exist".to_string());
        }
        if !abs.is_file() {
            return Err("path is not a file".to_string());
        }
        Ok(abs.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_rename_path(
    state: State<'_, SpaceState>,
    from_path: String,
    to_path: String,
) -> Result<(), String> {
    let root = state.current_root()?;
    let recent_local_changes = state.recent_local_changes();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let from_rel = PathBuf::from(&from_path);
        let to_rel = PathBuf::from(&to_path);
        deny_hidden_rel_path(&from_rel)?;
        deny_hidden_rel_path(&to_rel)?;
        let from_abs = paths::join_under(&root, &from_rel)?;
        let to_abs = paths::join_under(&root, &to_rel)?;
        if !from_abs.exists() {
            return Err("source path does not exist".to_string());
        }
        if to_abs.exists() {
            return Err("destination path already exists".to_string());
        }
        if let Some(parent) = to_abs.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let is_dir = from_abs.is_dir();
        std::fs::rename(&from_abs, &to_abs).map_err(|e| e.to_string())?;
        reindex_after_rename(
            &root,
            &from_path,
            &to_path,
            &to_abs,
            is_dir,
            &recent_local_changes,
        );
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn reindex_after_rename(
    root: &Path,
    from_path: &str,
    to_path: &str,
    to_abs: &Path,
    is_dir: bool,
    recent_local_changes: &RecentLocalChanges,
) {
    if is_dir {
        let prefix = if from_path.ends_with('/') {
            from_path.to_string()
        } else {
            format!("{from_path}/")
        };
        let new_prefix = if to_path.ends_with('/') {
            to_path.to_string()
        } else {
            format!("{to_path}/")
        };
        if let Ok(conn) = index::open_db(root) {
            if let Ok(mut stmt) = conn.prepare("SELECT id FROM notes WHERE id LIKE ?") {
                let pattern = format!("{prefix}%");
                if let Ok(rows) = stmt.query_map([&pattern], |row| row.get::<_, String>(0)) {
                    let old_ids: Vec<String> = rows.filter_map(|r| r.ok()).collect();
                    for old_id in old_ids {
                        let new_id = format!("{new_prefix}{}", &old_id[prefix.len()..]);
                        mark_recent_local_change(recent_local_changes, &old_id);
                        mark_recent_local_change(recent_local_changes, &new_id);
                        let _ = index::remove_note(root, &old_id);
                        let abs = root.join(&new_id);
                        if let Ok(markdown) = std::fs::read_to_string(&abs) {
                            let _ = index::index_note(root, &new_id, &markdown);
                        }
                    }
                }
            }
        }
    } else if utils::is_markdown_path(to_abs) {
        mark_recent_local_change(recent_local_changes, from_path);
        mark_recent_local_change(recent_local_changes, to_path);
        let _ = index::remove_note(root, from_path);
        if let Ok(markdown) = std::fs::read_to_string(to_abs) {
            let _ = index::index_note(root, to_path, &markdown);
        }
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_delete_path(
    state: State<'_, SpaceState>,
    path: String,
    recursive: Option<bool>,
) -> Result<(), String> {
    let root = state.current_root()?;
    let recent_local_changes = state.recent_local_changes();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let rel = PathBuf::from(&path);
        if rel.as_os_str().is_empty() {
            return Err("path is required".to_string());
        }
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        let meta = std::fs::metadata(&abs).map_err(|e| e.to_string())?;
        remove_markdown_notes_from_index(&root, &path, &abs, &recent_local_changes, meta.is_dir());
        if meta.is_dir() {
            if recursive.unwrap_or(false) {
                move_path_to_trash(&abs)
            } else {
                Err("recursive delete must be confirmed for directories".to_string())
            }
        } else {
            move_path_to_trash(&abs)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_relativize_path(
    state: State<'_, SpaceState>,
    abs_path: String,
) -> Result<String, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        let abs_input = PathBuf::from(abs_path);
        let abs = if abs_input.exists() {
            abs_input.canonicalize().map_err(|e| e.to_string())?
        } else {
            let parent = abs_input
                .parent()
                .ok_or_else(|| "path has no parent directory".to_string())?;
            let file_name = abs_input
                .file_name()
                .ok_or_else(|| "path has no file name".to_string())?;
            let parent = parent.canonicalize().map_err(|e| e.to_string())?;
            parent.join(file_name)
        };
        let rel = abs
            .strip_prefix(&root)
            .map_err(|_| "path is not inside the current space".to_string())?;
        Ok(rel.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{duplicate_file_under_root, next_duplicate_file_name};
    use crate::index::open_db;
    use crate::space::state::{has_recent_local_change, RecentLocalChanges};
    use std::{
        collections::{HashMap, HashSet},
        path::{Path, PathBuf},
        sync::{Arc, Mutex},
    };

    struct TempSpace {
        root: PathBuf,
    }

    impl TempSpace {
        fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("glyph-duplicate-test-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&root).expect("temp space should be created");
            Self { root }
        }

        fn path(&self) -> &Path {
            &self.root
        }
    }

    impl Drop for TempSpace {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    fn fresh_recent_local_changes() -> RecentLocalChanges {
        Arc::new(Mutex::new(HashMap::new()))
    }

    #[test]
    fn duplicate_name_uses_copy_suffix_and_preserves_extension() {
        let existing = HashSet::new();
        assert_eq!(
            next_duplicate_file_name(&existing, "Archive.tar.gz"),
            "Archive.tar Copy.gz"
        );
        assert_eq!(next_duplicate_file_name(&existing, "Todo"), "Todo Copy");
    }

    #[test]
    fn duplicate_name_increments_with_case_insensitive_collisions() {
        let existing = HashSet::from([
            "note copy.md".to_string(),
            "note copy 2.md".to_string(),
        ]);
        assert_eq!(
            next_duplicate_file_name(&existing, "Note.md"),
            "Note Copy 3.md"
        );
    }

    #[test]
    fn duplicates_plain_files_without_marking_recent_local_changes() {
        let temp_space = TempSpace::new();
        let root = temp_space.path();
        let rel_path = Path::new("assets/spec.pdf");
        let abs_path = root.join(rel_path);
        std::fs::create_dir_all(abs_path.parent().expect("file should have parent"))
            .expect("parent dir should be created");
        let bytes = vec![0_u8, 1, 2, 3, 4, 5];
        std::fs::write(&abs_path, &bytes).expect("source file should be written");

        let recent_local_changes = fresh_recent_local_changes();
        let duplicated =
            duplicate_file_under_root(root, rel_path, &recent_local_changes).expect("duplicate");

        assert_eq!(duplicated.rel_path, "assets/spec Copy.pdf");
        assert!(!duplicated.is_markdown);
        assert_eq!(
            std::fs::read(root.join(&duplicated.rel_path)).expect("duplicate file should exist"),
            bytes
        );
        assert!(!has_recent_local_change(
            &recent_local_changes,
            &duplicated.rel_path
        ));
    }

    #[test]
    fn duplicates_markdown_files_and_indexes_the_copy() {
        let temp_space = TempSpace::new();
        let root = temp_space.path();
        let rel_path = Path::new("notes/Plan.md");
        let abs_path = root.join(rel_path);
        std::fs::create_dir_all(abs_path.parent().expect("file should have parent"))
            .expect("parent dir should be created");
        let markdown = "# Plan\n\n- [ ] Ship duplication\n";
        std::fs::write(&abs_path, markdown).expect("source markdown should be written");

        let recent_local_changes = fresh_recent_local_changes();
        let duplicated =
            duplicate_file_under_root(root, rel_path, &recent_local_changes).expect("duplicate");

        assert_eq!(duplicated.rel_path, "notes/Plan Copy.md");
        assert!(duplicated.is_markdown);
        assert_eq!(
            std::fs::read_to_string(root.join(&duplicated.rel_path))
                .expect("duplicate markdown should exist"),
            markdown
        );
        assert!(has_recent_local_change(
            &recent_local_changes,
            &duplicated.rel_path
        ));

        let conn = open_db(root).expect("db should open");
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE id = ?",
                [&duplicated.rel_path],
                |row| row.get(0),
            )
            .expect("count query should succeed");
        assert_eq!(count, 1);
    }

    #[test]
    fn duplicates_invalid_utf8_markdown_without_failing() {
        let temp_space = TempSpace::new();
        let root = temp_space.path();
        let rel_path = Path::new("notes/Broken.md");
        let abs_path = root.join(rel_path);
        std::fs::create_dir_all(abs_path.parent().expect("file should have parent"))
            .expect("parent dir should be created");
        std::fs::write(&abs_path, [0xff_u8, 0xfe, b'\n']).expect("source markdown should be written");

        let recent_local_changes = fresh_recent_local_changes();
        let duplicated =
            duplicate_file_under_root(root, rel_path, &recent_local_changes).expect("duplicate");

        assert_eq!(duplicated.rel_path, "notes/Broken Copy.md");
        assert!(duplicated.is_markdown);
        assert!(has_recent_local_change(
            &recent_local_changes,
            &duplicated.rel_path
        ));
        assert_eq!(
            std::fs::read(root.join(&duplicated.rel_path)).expect("duplicate file should exist"),
            vec![0xff_u8, 0xfe, b'\n']
        );
    }
}
