use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::glyph_paths::ensure_glyph_dir;
use crate::io_atomic;

use super::types::{
    DatabaseCellValue, DatabaseColumn, DatabaseStore, DatabaseSummary, DatabaseViewDefinition,
    DatabaseViewGrouping,
};

const DATABASES_STORE_FILE: &str = "databases.json";

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn databases_store_path(space_root: &Path) -> Result<PathBuf, String> {
    Ok(ensure_glyph_dir(space_root)?.join(DATABASES_STORE_FILE))
}

pub(crate) fn default_view(name: &str) -> DatabaseViewDefinition {
    let now = now_iso();
    DatabaseViewDefinition {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        layout: "board".to_string(),
        search: String::new(),
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
        grouping: Some(DatabaseViewGrouping {
            column_id: "tags".to_string(),
            ascending: true,
        }),
        board_lane_colors: Default::default(),
        board_lane_order: Default::default(),
        board_card_order: Default::default(),
        board_card_fields: Default::default(),
        created_at: now.clone(),
        updated_at: now,
    }
}

fn normalize_frontmatter_property_kind(kind: &mut String) {
    if matches!(
        kind.as_str(),
        "text"
            | "url"
            | "date"
            | "checkbox"
            | "tags"
            | "status"
            | "priority"
            | "relation"
            | "multi_select"
    ) {
        return;
    }
    *kind = "text".to_string();
}

fn normalized_field_name(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .replace(['_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn matches_field_name(label: &str, property_key: Option<&str>, names: &[&str]) -> bool {
    let normalized_names = names
        .iter()
        .map(|name| normalized_field_name(name))
        .collect::<Vec<_>>();
    [Some(label), property_key]
        .into_iter()
        .flatten()
        .map(normalized_field_name)
        .any(|value| normalized_names.iter().any(|name| name == &value))
}

pub(crate) fn default_field_value(
    label: &str,
    kind: &str,
    property_key: Option<&str>,
) -> Option<DatabaseCellValue> {
    let normalized_key = property_key.map(normalized_field_name).unwrap_or_default();
    let normalized_label = normalized_field_name(label);
    let is_status = kind == "status"
        || normalized_key == "status"
        || normalized_key.ends_with(" status")
        || normalized_label == "status"
        || normalized_label.ends_with(" status");
    let default_text = if is_status {
        Some("Not Started".to_string())
    } else if kind == "priority" || matches_field_name(label, property_key, &["priority", "prio"]) {
        Some("No".to_string())
    } else {
        None
    };
    if default_text.is_none() && kind != "checkbox" {
        return None;
    }
    let is_list = matches!(kind, "tags" | "relation" | "multi_select");

    Some(DatabaseCellValue {
        kind: kind.to_string(),
        value_text: if is_list { None } else { default_text.clone() },
        value_bool: (kind == "checkbox").then_some(false),
        value_list: if is_list {
            default_text.into_iter().collect()
        } else {
            Vec::new()
        },
    })
}

fn normalize_schema_field_defaults(store: &mut DatabaseStore) {
    for database in &mut store.databases {
        for field in &mut database.schema {
            if field.property_key.is_none() {
                continue;
            }
            if field.default_value.is_none() {
                field.default_value =
                    default_field_value(&field.label, &field.kind, field.property_key.as_deref());
            }
        }
    }
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

fn prune_unsupported_view_layouts(store: &mut DatabaseStore) {
    for database in &mut store.databases {
        database
            .views
            .retain(|view| matches!(view.layout.as_str(), "table" | "board"));
        if database.views.is_empty() {
            database.views.push(default_view("View 1"));
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

fn normalize_store_on_load(mut store: DatabaseStore) -> DatabaseStore {
    if store.version == 0 {
        store.version = 1;
    }
    normalize_store_property_kinds(&mut store);
    prune_unsupported_view_layouts(&mut store);
    normalize_status_colors(&mut store);
    normalize_schema_field_defaults(&mut store);
    store
}

fn default_store() -> DatabaseStore {
    DatabaseStore {
        version: 1,
        status_colors: BTreeMap::new(),
        databases: Vec::new(),
    }
}

pub fn load_store(space_root: &Path) -> Result<DatabaseStore, String> {
    let path = databases_store_path(space_root)?;
    match std::fs::read(&path) {
        Ok(bytes) => {
            let store: DatabaseStore = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            Ok(normalize_store_on_load(store))
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

pub fn list_summaries(store: &DatabaseStore) -> Vec<DatabaseSummary> {
    let mut summaries = store
        .databases
        .iter()
        .map(|database| DatabaseSummary {
            id: database.id.clone(),
            name: database.name.clone(),
            icon: database.icon.clone(),
            color: database.color.clone(),
            view_count: database.views.len() as u32,
        })
        .collect::<Vec<_>>();
    summaries.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    summaries
}
