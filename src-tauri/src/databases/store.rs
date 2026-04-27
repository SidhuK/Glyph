use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::glyph_paths::ensure_glyph_dir;
use crate::io_atomic;

use super::types::{
    DatabaseColumn, DatabaseDefinition, DatabaseFilter, DatabaseNewNoteConfig, DatabaseSchemaField,
    DatabaseSource, DatabaseStore, DatabaseSummary, DatabaseViewDefinition,
};

const DATABASES_STORE_FILE: &str = "databases.json";
const DATABASES_STORE_VERSION: u32 = 3;

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn databases_store_path(space_root: &Path) -> Result<PathBuf, String> {
    Ok(ensure_glyph_dir(space_root)?.join(DATABASES_STORE_FILE))
}

fn stable_view_id(seed: &str) -> String {
    format!("system-view:{seed}")
}

pub(crate) fn default_view(name: &str) -> DatabaseViewDefinition {
    let now = now_iso();
    DatabaseViewDefinition {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        layout: "table".to_string(),
        icon: None,
        color: None,
        columns: vec![
            DatabaseColumn {
                id: "title".to_string(),
                column_type: "title".to_string(),
                label: "Title".to_string(),
                icon: Some("document".to_string()),
                width: Some(320),
                visible: true,
                property_key: None,
                property_kind: None,
            },
            DatabaseColumn {
                id: "tags".to_string(),
                column_type: "tags".to_string(),
                label: "Tags".to_string(),
                icon: Some("tag".to_string()),
                width: Some(220),
                visible: true,
                property_key: None,
                property_kind: None,
            },
            DatabaseColumn {
                id: "updated".to_string(),
                column_type: "updated".to_string(),
                label: "Updated".to_string(),
                icon: Some("clock".to_string()),
                width: Some(180),
                visible: true,
                property_key: None,
                property_kind: None,
            },
        ],
        sorts: Vec::new(),
        filters: Vec::new(),
        grouping: None,
        board_lane_colors: Default::default(),
        board_lane_order: Default::default(),
        created_at: now.clone(),
        updated_at: now,
    }
}

fn recent_view() -> DatabaseViewDefinition {
    let mut view = default_view("Recent");
    view.name = "Recent".to_string();
    view.filters = vec![DatabaseFilter {
        column_id: "updated".to_string(),
        operator: "within_last_7_days".to_string(),
        value_text: Some("Last 7 Days".to_string()),
        value_bool: None,
        value_list: Vec::new(),
    }];
    view
}

fn system_database(id: &str, name: &str, recent: bool) -> DatabaseDefinition {
    let now = now_iso();
    let mut view = if recent {
        recent_view()
    } else {
        default_view("Table")
    };
    view.id = stable_view_id(&format!("glyph://system-database/{id}/{}", view.name));
    DatabaseDefinition {
        id: id.to_string(),
        name: name.to_string(),
        icon: None,
        color: None,
        is_system: true,
        source: DatabaseSource {
            kind: "all_notes".to_string(),
            value: String::new(),
            recursive: true,
        },
        new_note: DatabaseNewNoteConfig {
            folder: String::new(),
        },
        schema: vec![
            DatabaseSchemaField {
                id: "title".to_string(),
                label: "Title".to_string(),
                kind: "title".to_string(),
                property_key: None,
                relation_database_id: None,
            },
            DatabaseSchemaField {
                id: "tags".to_string(),
                label: "Tags".to_string(),
                kind: "tags".to_string(),
                property_key: None,
                relation_database_id: None,
            },
            DatabaseSchemaField {
                id: "updated".to_string(),
                label: "Updated".to_string(),
                kind: "datetime".to_string(),
                property_key: None,
                relation_database_id: None,
            },
        ],
        views: vec![view],
        created_at: now.clone(),
        updated_at: now,
    }
}

fn normalize_frontmatter_property_kind(kind: &mut String) {
    if matches!(
        kind.as_str(),
        "text" | "url" | "date" | "checkbox" | "tags" | "status" | "relation" | "multi_select"
    ) {
        return;
    }
    *kind = "text".to_string();
}

fn normalize_store_property_kinds(store: &mut DatabaseStore) {
    for database in &mut store.databases {
        for field in &mut database.schema {
            if field.property_key.is_some() {
                normalize_frontmatter_property_kind(&mut field.kind);
            }
        }
        for view in &mut database.views {
            for column in &mut view.columns {
                if let Some(kind) = &mut column.property_kind {
                    normalize_frontmatter_property_kind(kind);
                }
            }
        }
    }
}

fn is_valid_status_color(color: &str) -> bool {
    matches!(
        color,
        "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "red"
    )
}

fn normalize_status_colors(store: &mut DatabaseStore) {
    store
        .status_colors
        .retain(|status, color| !status.trim().is_empty() && is_valid_status_color(color));
}

fn default_store() -> DatabaseStore {
    DatabaseStore {
        version: DATABASES_STORE_VERSION,
        status_colors: BTreeMap::new(),
        databases: vec![
            system_database("all-notes", "All Notes", false),
            system_database("recently-edited", "Recently Edited", true),
        ],
    }
}

pub fn load_store(space_root: &Path) -> Result<DatabaseStore, String> {
    let path = databases_store_path(space_root)?;
    match std::fs::read(&path) {
        Ok(bytes) => {
            let mut store: DatabaseStore =
                serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            if store.version > DATABASES_STORE_VERSION {
                return Err(format!(
                    "unsupported databases store version {} (max supported {})",
                    store.version, DATABASES_STORE_VERSION
                ));
            }
            if store.version == 0 {
                store.version = DATABASES_STORE_VERSION;
            }
            normalize_store_property_kinds(&mut store);
            normalize_status_colors(&mut store);
            Ok(bootstrap_defaults(store))
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(default_store()),
        Err(err) => Err(err.to_string()),
    }
}

pub fn save_store(space_root: &Path, store: &DatabaseStore) -> Result<(), String> {
    let path = databases_store_path(space_root)?;
    let bytes = serde_json::to_vec_pretty(store).map_err(|e| e.to_string())?;
    io_atomic::write_atomic(&path, &bytes).map_err(|e| e.to_string())
}

pub fn bootstrap_defaults(mut store: DatabaseStore) -> DatabaseStore {
    let defaults = default_store();
    for database in defaults.databases {
        if store.databases.iter().any(|entry| entry.id == database.id) {
            continue;
        }
        store.databases.push(database);
    }
    store.version = DATABASES_STORE_VERSION;
    normalize_status_colors(&mut store);
    store
}

pub fn list_summaries(store: &DatabaseStore) -> Vec<DatabaseSummary> {
    let mut summaries = store
        .databases
        .iter()
        .map(|database| DatabaseSummary {
            id: database.id.clone(),
            name: database.name.clone(),
            icon: database.icon.clone(),
            color: database.color.clone(),
            is_system: database.is_system,
            view_count: database.views.len() as u32,
        })
        .collect::<Vec<_>>();
    summaries.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    summaries
}
