use crate::{index, vault::VaultState};
use serde::{Deserialize, Serialize};
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

fn validate_id(id: &str) -> Result<(), String> {
    let _ = uuid::Uuid::parse_str(id).map_err(|_| "invalid canvas id".to_string())?;
    Ok(())
}

fn read_doc(conn: &rusqlite::Connection, id: &str) -> Result<CanvasDoc, String> {
    validate_id(id)?;
    let doc_json: String = conn
        .query_row(
            "SELECT doc_json FROM canvases WHERE id = ? LIMIT 1",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let doc: CanvasDoc = serde_json::from_str(&doc_json).map_err(|e| e.to_string())?;
    Ok(doc)
}

fn upsert_doc(conn: &rusqlite::Connection, mut doc: CanvasDoc) -> Result<CanvasDoc, String> {
    validate_id(&doc.id)?;
    if doc.version != CANVAS_VERSION {
        return Err("unsupported canvas version".to_string());
    }
    doc.updated = now_rfc3339();
    let doc_json = serde_json::to_string(&doc).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO canvases(id, title, updated, doc_json) VALUES(?, ?, ?, ?)",
        rusqlite::params![doc.id, doc.title, doc.updated, doc_json],
    )
    .map_err(|e| e.to_string())?;
    Ok(doc)
}

#[tauri::command]
pub async fn canvas_list(state: State<'_, VaultState>) -> Result<Vec<CanvasMeta>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<CanvasMeta>, String> {
        let conn = index::open_db(&root)?;
        let mut stmt = conn
            .prepare("SELECT id, title, updated FROM canvases ORDER BY updated DESC LIMIT 200")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        let mut out: Vec<CanvasMeta> = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            out.push(CanvasMeta {
                id: row.get(0).map_err(|e| e.to_string())?,
                title: row.get(1).map_err(|e| e.to_string())?,
                updated: row.get(2).map_err(|e| e.to_string())?,
            });
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn canvas_create(
    state: State<'_, VaultState>,
    title: String,
) -> Result<CanvasMeta, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<CanvasMeta, String> {
        let conn = index::open_db(&root)?;
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
        let doc = upsert_doc(&conn, doc)?;
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
        let conn = index::open_db(&root)?;
        read_doc(&conn, &id)
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
pub async fn canvas_write(
    state: State<'_, VaultState>,
    doc: CanvasWritePayload,
) -> Result<CanvasDoc, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<CanvasDoc, String> {
        let conn = index::open_db(&root)?;
        let doc = CanvasDoc {
            version: doc.version,
            id: doc.id,
            title: doc.title,
            updated: now_rfc3339(),
            nodes: doc.nodes,
            edges: doc.edges,
        };
        upsert_doc(&conn, doc)
    })
    .await
    .map_err(|e| e.to_string())?
}
