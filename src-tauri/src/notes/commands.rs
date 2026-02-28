use std::{ffi::OsStr, path::Path};
use tauri::State;

use crate::space::state::mark_recent_local_change;
use crate::{index, io_atomic, paths, space::SpaceState};

use super::frontmatter::{
    normalize_frontmatter_mapping, now_rfc3339, parse_frontmatter, parse_frontmatter_mapping,
    render_frontmatter_mapping_yaml, split_frontmatter,
};
use super::helpers::{
    etag_for, extract_meta, file_mtime_ms, note_abs_path, note_rel_path, notes_dir, read_to_string,
};
use super::types::{NoteDoc, NoteMeta, NoteWriteResult};

#[tauri::command]
pub async fn notes_list(state: State<'_, SpaceState>) -> Result<Vec<NoteMeta>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<NoteMeta>, String> {
        let dir = notes_dir(&root)?;
        if !dir.exists() {
            return Ok(Vec::new());
        }

        let mut out: Vec<NoteMeta> = Vec::new();
        for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension() != Some(OsStr::new("md")) {
                continue;
            }
            let file_stem = match path.file_stem().and_then(|s| s.to_str()) {
                Some(s) => s,
                None => continue,
            };
            if uuid::Uuid::parse_str(file_stem).is_err() {
                continue;
            }
            let markdown = read_to_string(&path)?;
            out.push(extract_meta(file_stem, &markdown)?);
        }

        out.sort_by(|a, b| b.updated.cmp(&a.updated));
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn note_create(state: State<'_, SpaceState>, title: String) -> Result<NoteMeta, String> {
    let root = state.current_root()?;
    let recent_local_changes = state.recent_local_changes();
    tauri::async_runtime::spawn_blocking(move || -> Result<NoteMeta, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let rel = note_rel_path(&id)?;
        let path = paths::join_under(&root, &rel)?;
        let rel_path = rel.to_string_lossy().to_string();

        let now = now_rfc3339();
        let mut fm = serde_yaml::Mapping::new();
        fm.insert(
            serde_yaml::Value::String("id".to_string()),
            serde_yaml::Value::String(id.clone()),
        );
        fm.insert(
            serde_yaml::Value::String("title".to_string()),
            serde_yaml::Value::String(title.clone()),
        );
        fm.insert(
            serde_yaml::Value::String("created".to_string()),
            serde_yaml::Value::String(now.clone()),
        );
        fm.insert(
            serde_yaml::Value::String("updated".to_string()),
            serde_yaml::Value::String(now.clone()),
        );
        fm.insert(
            serde_yaml::Value::String("tags".to_string()),
            serde_yaml::Value::Sequence(Vec::new()),
        );

        let yaml = render_frontmatter_mapping_yaml(&fm)?;
        let markdown = format!("---\n{yaml}---\n\n");
        mark_recent_local_change(&recent_local_changes, &rel_path);
        io_atomic::write_atomic(&path, markdown.as_bytes()).map_err(|e| e.to_string())?;
        let _ = index::index_note(&root, &id, &markdown);

        Ok(NoteMeta {
            id,
            title,
            created: now.clone(),
            updated: now,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn note_read(state: State<'_, SpaceState>, id: String) -> Result<NoteDoc, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<NoteDoc, String> {
        let path = note_abs_path(&root, &id)?;
        let markdown = read_to_string(&path)?;
        let meta = extract_meta(&id, &markdown)?;
        Ok(NoteDoc {
            meta,
            etag: etag_for(&markdown),
            mtime_ms: file_mtime_ms(&path),
            markdown,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn read_existing_created(path: &Path) -> Option<String> {
    let markdown = std::fs::read_to_string(path).ok()?;
    let (yaml, _body) = split_frontmatter(&markdown);
    let fm = parse_frontmatter(yaml).ok()?;
    fm.created
}

fn created_from_markdown(markdown: &str) -> Option<String> {
    let (yaml, _body) = split_frontmatter(markdown);
    let fm = parse_frontmatter(yaml).ok()?;
    fm.created
}

#[tauri::command(rename_all = "snake_case")]
pub async fn note_write(
    state: State<'_, SpaceState>,
    id: String,
    markdown: String,
    base_etag: Option<String>,
) -> Result<NoteWriteResult, String> {
    let root = state.current_root()?;
    let recent_local_changes = state.recent_local_changes();
    tauri::async_runtime::spawn_blocking(move || -> Result<NoteWriteResult, String> {
        let path = note_abs_path(&root, &id)?;
        let current = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        if let Some(base) = base_etag {
            let current_etag = etag_for(&current);
            if current_etag != base {
                return Err("conflict: note changed on disk".to_string());
            }
        }

        let preserve_created =
            created_from_markdown(&current).or_else(|| read_existing_created(&path));
        let (yaml, body) = split_frontmatter(&markdown);
        let fm = parse_frontmatter_mapping(yaml)?;
        let fm = normalize_frontmatter_mapping(fm, &id, None, preserve_created.as_deref());
        let yaml = render_frontmatter_mapping_yaml(&fm)?;
        let normalized = format!("---\n{yaml}---\n\n{}", body.trim_start_matches('\n'));
        let rel_path = note_rel_path(&id)?.to_string_lossy().to_string();
        mark_recent_local_change(&recent_local_changes, &rel_path);
        io_atomic::write_atomic(&path, normalized.as_bytes()).map_err(|e| e.to_string())?;
        let _ = index::index_note(&root, &id, &normalized);
        let meta = extract_meta(&id, &normalized)?;
        Ok(NoteWriteResult {
            meta,
            etag: etag_for(&normalized),
            mtime_ms: file_mtime_ms(&path),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn note_delete(state: State<'_, SpaceState>, id: String) -> Result<(), String> {
    let root = state.current_root()?;
    let recent_local_changes = state.recent_local_changes();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let path = note_abs_path(&root, &id)?;
        let rel_path = note_rel_path(&id)?.to_string_lossy().to_string();
        mark_recent_local_change(&recent_local_changes, &rel_path);
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        let _ = index::remove_note(&root, &id);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
