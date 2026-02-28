use serde::Serialize;
use std::{
    collections::HashMap,
    ffi::OsStr,
    path::{Path, PathBuf},
};
use tauri::State;

use crate::{index::open_db, paths, utils, space::SpaceState};

use super::{
    helpers::{deny_hidden_rel_path, should_hide},
    types::FsEntry,
};

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct FolderViewFolder {
    pub dir_rel_path: String,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct FolderViewNotePreview {
    pub id: String,
    pub title: String,
    pub content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct FolderViewData {
    pub files: Vec<FsEntry>,
    pub subfolders: Vec<FolderViewFolder>,
    pub note_previews: Vec<FolderViewNotePreview>,
}

fn list_files(root: &Path, dir: &Path, limit: usize) -> Result<Vec<FsEntry>, String> {
    let mut out: Vec<FsEntry> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![dir.to_path_buf()];
    while let Some(rel_dir) = stack.pop() {
        let abs_dir = paths::join_under(root, &rel_dir)?;
        let entries = match std::fs::read_dir(abs_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if should_hide(&name) {
                continue;
            }
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let child_rel = rel_dir.join(&name);
            if meta.is_dir() {
                stack.push(child_rel);
                continue;
            }
            if !meta.is_file() {
                continue;
            }
            out.push(FsEntry {
                name,
                rel_path: utils::to_slash(&child_rel),
                kind: "file".to_string(),
                is_markdown: utils::is_markdown_path(&child_rel),
            });
            if out.len() >= limit {
                break;
            }
        }
        if out.len() >= limit {
            break;
        }
    }
    out.sort_by_cached_key(|f| f.rel_path.to_lowercase());
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn space_folder_view_data(
    state: State<'_, SpaceState>,
    dir: Option<String>,
    limit: Option<u32>,
    recent_limit: Option<u32>,
) -> Result<FolderViewData, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || {
        let limit = limit.unwrap_or(500).clamp(1, 5_000) as usize;
        let recent_limit = recent_limit.unwrap_or(5).clamp(1, 50) as usize;
        let dir_rel = PathBuf::from(dir.unwrap_or_default());
        deny_hidden_rel_path(&dir_rel)?;

        let files = list_files(&root, &dir_rel, limit)?;
        let mut file_by_rel: HashMap<String, FsEntry> =
            files.into_iter().map(|f| (f.rel_path.clone(), f)).collect();

        let abs_dir = paths::join_under(&root, &dir_rel)?;
        let mut subfolders: Vec<FolderViewFolder> = Vec::new();
        let mut recent: Vec<(u64, String)> = Vec::new();
        for entry in std::fs::read_dir(&abs_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name().to_string_lossy().to_string();
            if should_hide(&name) {
                continue;
            }
            let meta = entry.metadata().map_err(|e| e.to_string())?;
            let rel = dir_rel.join(&name);
            if meta.is_dir() {
                subfolders.push(FolderViewFolder {
                    dir_rel_path: utils::to_slash(&rel),
                    name,
                });
                continue;
            }
            if meta.is_file() {
                let mtime = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                recent.push((mtime, utils::to_slash(&rel)));
            }
        }

        recent.sort_by(|a, b| b.0.cmp(&a.0));
        for (_mtime, rel) in recent.into_iter().take(recent_limit) {
            if file_by_rel.contains_key(&rel) {
                continue;
            }
            let name = rel.rsplit('/').next().unwrap_or(&rel).to_string();
            let md = Path::new(&rel).extension() == Some(OsStr::new("md"));
            file_by_rel.insert(
                rel.clone(),
                FsEntry {
                    name,
                    rel_path: rel,
                    kind: "file".to_string(),
                    is_markdown: md,
                },
            );
        }

        let mut root_files = file_by_rel.into_values().collect::<Vec<_>>();
        root_files.sort_by_cached_key(|f| f.rel_path.to_lowercase());
        let ids = root_files
            .iter()
            .filter(|f| f.is_markdown)
            .map(|f| f.rel_path.clone())
            .collect::<Vec<_>>();

        let previews = if ids.is_empty() {
            Vec::new()
        } else {
            let conn = open_db(&root)?;
            let placeholders = std::iter::repeat_n("?", ids.len())
                .collect::<Vec<_>>()
                .join(", ");
            let sql = format!("SELECT id, title, preview FROM notes WHERE id IN ({placeholders})");
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let mut rows = stmt
                .query(rusqlite::params_from_iter(ids.iter()))
                .map_err(|e| e.to_string())?;
            let mut out = Vec::new();
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                out.push(FolderViewNotePreview {
                    id: row.get(0).map_err(|e| e.to_string())?,
                    title: row.get(1).map_err(|e| e.to_string())?,
                    content: row.get(2).map_err(|e| e.to_string())?,
                });
            }
            out
        };

        subfolders.sort_by_cached_key(|f| f.dir_rel_path.to_lowercase());
        Ok(FolderViewData {
            files: root_files,
            subfolders,
            note_previews: previews,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
