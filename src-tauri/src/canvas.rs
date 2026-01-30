use crate::{io_atomic, paths, vault::VaultState};
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
};
use tauri::State;
use time::format_description::well_known::Rfc3339;

#[derive(Serialize)]
pub struct CanvasMeta {
    pub id: String,
    pub title: String,
    pub updated: String,
}

#[derive(Serialize, Deserialize)]
pub struct CanvasDoc {
    pub version: u32,
    pub id: String,
    pub title: String,
    pub updated: String,
    #[serde(default)]
    pub nodes: Vec<serde_json::Value>,
    #[serde(default)]
    pub edges: Vec<serde_json::Value>,
}

const CANVAS_VERSION: u32 = 1;

fn now_rfc3339() -> String {
    time::OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn canvases_dir(root: &Path) -> Result<PathBuf, String> {
    paths::join_under(root, Path::new("canvases"))
}

fn canvas_rel_path(id: &str) -> Result<PathBuf, String> {
    let _ = uuid::Uuid::parse_str(id).map_err(|_| "invalid canvas id".to_string())?;
    Ok(PathBuf::from("canvases").join(format!("{id}.json")))
}

fn canvas_abs_path(root: &Path, id: &str) -> Result<PathBuf, String> {
    let rel = canvas_rel_path(id)?;
    paths::join_under(root, &rel)
}

fn read_doc(path: &Path) -> Result<CanvasDoc, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let doc: CanvasDoc = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    Ok(doc)
}

fn write_doc(root: &Path, mut doc: CanvasDoc) -> Result<CanvasDoc, String> {
    if doc.version != CANVAS_VERSION {
        return Err("unsupported canvas version".to_string());
    }

    doc.updated = now_rfc3339();
    let path = canvas_abs_path(root, &doc.id)?;
    let bytes = serde_json::to_vec_pretty(&doc).map_err(|e| e.to_string())?;
    io_atomic::write_atomic(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(doc)
}

#[tauri::command]
pub async fn canvas_list(state: State<'_, VaultState>) -> Result<Vec<CanvasMeta>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<CanvasMeta>, String> {
        let dir = canvases_dir(&root)?;
        if !dir.exists() {
            return Ok(Vec::new());
        }

        let mut out: Vec<CanvasMeta> = Vec::new();
        for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension() != Some(OsStr::new("json")) {
                continue;
            }
            let file_stem = match path.file_stem().and_then(|s| s.to_str()) {
                Some(s) => s,
                None => continue,
            };
            if uuid::Uuid::parse_str(file_stem).is_err() {
                continue;
            }
            let doc = read_doc(&path)?;
            out.push(CanvasMeta {
                id: doc.id,
                title: doc.title,
                updated: doc.updated,
            });
        }

        out.sort_by(|a, b| b.updated.cmp(&a.updated));
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn canvas_create(state: State<'_, VaultState>, title: String) -> Result<CanvasMeta, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<CanvasMeta, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let doc = CanvasDoc {
            version: CANVAS_VERSION,
            id: id.clone(),
            title: if title.trim().is_empty() {
                "Canvas".to_string()
            } else {
                title
            },
            updated: now_rfc3339(),
            nodes: Vec::new(),
            edges: Vec::new(),
        };
        let doc = write_doc(&root, doc)?;
        Ok(CanvasMeta {
            id: doc.id,
            title: doc.title,
            updated: doc.updated,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn canvas_read(state: State<'_, VaultState>, id: String) -> Result<CanvasDoc, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<CanvasDoc, String> {
        let path = canvas_abs_path(&root, &id)?;
        read_doc(&path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
pub struct CanvasWritePayload {
    pub version: u32,
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub nodes: Vec<serde_json::Value>,
    #[serde(default)]
    pub edges: Vec<serde_json::Value>,
}

#[tauri::command]
pub async fn canvas_write(state: State<'_, VaultState>, doc: CanvasWritePayload) -> Result<CanvasDoc, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<CanvasDoc, String> {
        let doc = CanvasDoc {
            version: doc.version,
            id: doc.id,
            title: doc.title,
            updated: now_rfc3339(),
            nodes: doc.nodes,
            edges: doc.edges,
        };
        write_doc(&root, doc)
    })
    .await
    .map_err(|e| e.to_string())?
}

