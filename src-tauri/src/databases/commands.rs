use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde_yaml::{Mapping, Value};
use tauri::State;
use uuid::Uuid;

use crate::index::index_note;
use crate::index::open_db;
use crate::io_atomic;
use crate::notes::frontmatter::{
    normalize_frontmatter_mapping, parse_frontmatter_mapping, render_frontmatter_mapping_yaml,
    split_frontmatter,
};
use crate::paths;
use crate::space::state::{mark_recent_local_change, RecentLocalChanges};
use crate::space::SpaceState;
use crate::space_fs::helpers::deny_hidden_rel_path;

use super::query::{load_database_document, query_database_rows, read_note_markdown, row_by_path};
use super::store::{
    bootstrap_defaults, default_field_value, default_view, list_summaries, load_store, save_store,
};
use super::types::{
    DatabaseCellValue, DatabaseColumn, DatabaseCreateRowResult, DatabaseDefinition,
    DatabaseDocument, DatabasePreviewContext, DatabaseRow, DatabaseSchemaField, DatabaseSummary,
};

fn key(name: &str) -> Value {
    Value::String(name.to_string())
}

fn slugify_title(title: &str) -> String {
    let slug = title
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == ' ' || ch == '-' || ch == '_' {
                ch
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if slug.is_empty() {
        "Untitled".to_string()
    } else {
        slug
    }
}

fn normalize_database_name(name: &str) -> Result<String, String> {
    let normalized = name.trim();
    if normalized.is_empty() {
        return Err("database name cannot be empty".to_string());
    }
    Ok(normalized.to_string())
}

fn normalize_status_id(status: &str) -> Result<String, String> {
    let normalized = status
        .trim()
        .to_lowercase()
        .replace([' ', '-'], "_")
        .split('_')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("_");
    if normalized.is_empty() {
        return Err("status is required".to_string());
    }
    Ok(normalized)
}

fn validate_status_color(color: &str) -> Result<(), String> {
    if matches!(
        color,
        "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "red"
    ) {
        Ok(())
    } else {
        Err("unsupported status color".to_string())
    }
}

fn prune_unsupported_database_view_layouts(database: &mut DatabaseDefinition) {
    database
        .views
        .retain(|view| matches!(view.layout.as_str(), "table" | "board"));
    if database.views.is_empty() {
        database.views.push(default_view("Table"));
    }
}

fn database_name_exists(
    databases: &[DatabaseDefinition],
    candidate: &str,
    exclude_id: Option<&str>,
) -> bool {
    databases.iter().any(|entry| {
        exclude_id.is_none_or(|id| entry.id != id) && entry.name.eq_ignore_ascii_case(candidate)
    })
}

fn render_note_markdown(path: &str, markdown: &str, mapping: Mapping) -> Result<String, String> {
    let (_yaml, body) = split_frontmatter(markdown);
    let normalized = normalize_frontmatter_mapping(mapping, path, None);
    let rendered_yaml = render_frontmatter_mapping_yaml(&normalized)?;
    Ok(format!(
        "---\n{rendered_yaml}---\n\n{}",
        body.trim_start_matches('\n')
    ))
}

fn yaml_value_from_cell(
    column: &DatabaseColumn,
    value: &DatabaseCellValue,
) -> Result<Value, String> {
    match column.column_type.as_str() {
        "title" => Ok(Value::String(value.value_text.clone().unwrap_or_default())),
        "tags" => Ok(Value::Sequence(
            value
                .value_list
                .iter()
                .map(|item| Value::String(item.clone()))
                .collect(),
        )),
        "property" => match column.property_kind.as_deref().unwrap_or("text") {
            "checkbox" => Ok(Value::Bool(value.value_bool.unwrap_or(false))),
            "tags" | "relation" | "multi_select" => Ok(Value::Sequence(
                value
                    .value_list
                    .iter()
                    .map(|item| Value::String(item.clone()))
                    .collect(),
            )),
            _ => Ok(Value::String(value.value_text.clone().unwrap_or_default())),
        },
        "path" | "folder" | "created" | "updated" | "linked_notes" => {
            Err(format!("{} columns are read-only", column.column_type))
        }
        other => Err(format!("unsupported column type '{other}'")),
    }
}

fn apply_cell_update_to_markdown(
    note_path: &str,
    markdown: &str,
    column: &DatabaseColumn,
    value: &DatabaseCellValue,
) -> Result<String, String> {
    let (yaml, _body) = split_frontmatter(markdown);
    let mut mapping = parse_frontmatter_mapping(yaml)?;
    match column.column_type.as_str() {
        "title" => {
            mapping.insert(key("title"), yaml_value_from_cell(column, value)?);
        }
        "tags" => {
            mapping.insert(key("tags"), yaml_value_from_cell(column, value)?);
        }
        "property" => {
            let property_key = column
                .property_key
                .clone()
                .ok_or_else(|| "property column is missing property_key".to_string())?;
            mapping.insert(key(&property_key), yaml_value_from_cell(column, value)?);
        }
        "path" | "folder" | "created" | "updated" | "linked_notes" => {
            return Err(format!("{} columns are read-only", column.column_type))
        }
        other => return Err(format!("unsupported column type '{other}'")),
    }
    render_note_markdown(note_path, markdown, mapping)
}

fn write_markdown_note(
    root: &Path,
    recent_local_changes: &RecentLocalChanges,
    rel_path: &str,
    markdown: &str,
) -> Result<(), String> {
    let rel = PathBuf::from(rel_path);
    deny_hidden_rel_path(&rel)?;
    let abs = paths::join_under(root, &rel)?;
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    mark_recent_local_change(recent_local_changes, rel_path);
    io_atomic::write_atomic(&abs, markdown.as_bytes()).map_err(|e| e.to_string())?;
    index_note(root, rel_path, markdown)?;
    Ok(())
}

fn write_new_markdown_note(
    root: &Path,
    recent_local_changes: &RecentLocalChanges,
    rel_path: &str,
    markdown: &str,
) -> Result<bool, String> {
    let rel = PathBuf::from(rel_path);
    deny_hidden_rel_path(&rel)?;
    let abs = paths::join_under(root, &rel)?;
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&abs)
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => return Ok(false),
        Err(error) => return Err(error.to_string()),
    };
    file.write_all(markdown.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    if let Some(parent) = abs.parent() {
        std::fs::File::open(parent)
            .and_then(|dir| dir.sync_all())
            .map_err(|e| e.to_string())?;
    }
    mark_recent_local_change(recent_local_changes, rel_path);
    index_note(root, rel_path, markdown)?;
    Ok(true)
}

fn validate_editable_column(row: &DatabaseRow, column: &DatabaseColumn) -> Result<(), String> {
    match column.column_type.as_str() {
        "title" | "tags" => Ok(()),
        "property" => {
            let property_key = column
                .property_key
                .as_deref()
                .ok_or_else(|| "property column is missing property_key".to_string())?;
            if row.properties.contains_key(property_key) || column.property_kind.is_some() {
                Ok(())
            } else {
                Err("unknown property column".to_string())
            }
        }
        "path" | "folder" | "created" | "updated" | "linked_notes" => {
            Err(format!("{} columns are read-only", column.column_type))
        }
        other => Err(format!("unsupported column type '{other}'")),
    }
}

struct NewRowFieldDefault {
    key: String,
    kind: String,
    value: DatabaseCellValue,
}

fn normalize_field_key(key: &str) -> String {
    key.trim().to_lowercase()
}

fn is_reserved_frontmatter_key(key: &str) -> bool {
    matches!(
        normalize_field_key(key).as_str(),
        "created"
            | "folder"
            | "glyph"
            | "id"
            | "linked_notes"
            | "path"
            | "tags"
            | "title"
            | "updated"
    )
}

fn schema_field_default(field: &DatabaseSchemaField) -> Option<NewRowFieldDefault> {
    let key = field.property_key.as_deref()?.trim();
    if key.is_empty() || is_reserved_frontmatter_key(key) {
        return None;
    }
    Some(NewRowFieldDefault {
        key: key.to_string(),
        kind: field.kind.clone(),
        value: field
            .default_value
            .clone()
            .or_else(|| default_field_value(&field.label, &field.kind, Some(key)))?,
    })
}

fn column_field_default(column: &DatabaseColumn) -> Option<NewRowFieldDefault> {
    if column.column_type != "property" {
        return None;
    }
    let key = column.property_key.as_deref()?.trim();
    if key.is_empty() || is_reserved_frontmatter_key(key) {
        return None;
    }
    let kind = column
        .property_kind
        .clone()
        .unwrap_or_else(|| "text".to_string());
    Some(NewRowFieldDefault {
        key: key.to_string(),
        value: default_field_value(&column.label, &kind, Some(key))?,
        kind,
    })
}

fn database_new_row_field_defaults(database: &DatabaseDefinition) -> Vec<NewRowFieldDefault> {
    let mut defaults = Vec::new();
    let mut seen = BTreeMap::<String, ()>::new();
    for field in &database.schema {
        let Some(default) = schema_field_default(field) else {
            continue;
        };
        if seen.insert(normalize_field_key(&default.key), ()).is_none() {
            defaults.push(default);
        }
    }
    for column in database.views.iter().flat_map(|view| view.columns.iter()) {
        let Some(default) = column_field_default(column) else {
            continue;
        };
        if seen.insert(normalize_field_key(&default.key), ()).is_none() {
            defaults.push(default);
        }
    }
    defaults
}

fn yaml_value_from_field_default(default: &NewRowFieldDefault) -> Value {
    match default.kind.as_str() {
        "checkbox" => Value::Bool(default.value.value_bool.unwrap_or(false)),
        "tags" | "relation" | "multi_select" => Value::Sequence(
            if default.value.value_list.is_empty() {
                default.value.value_text.iter().cloned().collect::<Vec<_>>()
            } else {
                default.value.value_list.clone()
            }
            .into_iter()
            .map(Value::String)
            .collect(),
        ),
        _ => default
            .value
            .value_text
            .clone()
            .map(Value::String)
            .unwrap_or(Value::Null),
    }
}

fn create_new_row_markdown(
    database: &DatabaseDefinition,
    note_path: &str,
    title: &str,
) -> Result<String, String> {
    let mut mapping = Mapping::new();
    mapping.insert(key("title"), Value::String(title.to_string()));
    for default in database_new_row_field_defaults(database) {
        mapping.insert(key(&default.key), yaml_value_from_field_default(&default));
    }
    mapping.insert(key("tags"), Value::Sequence(Vec::new()));
    render_note_markdown(note_path, "", mapping)
}

fn word_count(markdown: &str) -> u32 {
    markdown.split_whitespace().count() as u32
}

const MAX_ROW_CREATE_COLLISION_INDEX: usize = 1_000;

fn backlink_note_paths(root: &Path, note_path: &str) -> Result<Vec<String>, String> {
    let conn = open_db(root)?;
    let stem = Path::new(note_path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_string();
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT n.id
             FROM notes n
             JOIN (
                SELECT l.from_id
                FROM links l
                WHERE l.to_id = ? OR (l.to_title IS NOT NULL AND l.to_title = ?)
                UNION
                SELECT r.from_id
                FROM note_relationships r
                WHERE r.to_id = ? OR r.to_title = ? OR r.target_title = ?
             ) refs ON refs.from_id = n.id
             ORDER BY n.updated DESC
             LIMIT 100",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params![note_path, stem, note_path, stem, stem])
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        out.push(row.get::<_, String>(0).map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn databases_list(state: State<'_, SpaceState>) -> Result<Vec<DatabaseSummary>, String> {
    let root = state.current_root()?;
    let db_store_mutex = state.db_store_mutex();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = db_store_mutex
            .lock()
            .map_err(|_| "database store mutex poisoned".to_string())?;
        let store = load_store(&root)?;
        Ok(list_summaries(&store))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn databases_get(
    state: State<'_, SpaceState>,
    database_id: String,
) -> Result<DatabaseDocument, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || {
        let store = bootstrap_defaults(load_store(&root)?);
        let database = store
            .databases
            .into_iter()
            .find(|entry| entry.id == database_id)
            .ok_or_else(|| "database not found".to_string())?;
        load_database_document(&root, &database)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn databases_create(
    state: State<'_, SpaceState>,
    name: String,
) -> Result<DatabaseDocument, String> {
    let root = state.current_root()?;
    let db_store_mutex = state.db_store_mutex();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = db_store_mutex
            .lock()
            .map_err(|_| "database store mutex poisoned".to_string())?;
        let normalized_name = normalize_database_name(&name)?;
        let mut store = bootstrap_defaults(load_store(&root)?);
        if database_name_exists(&store.databases, &normalized_name, None) {
            return Err("database name already exists".to_string());
        }
        let now = chrono::Utc::now().to_rfc3339();
        let database = super::types::DatabaseDefinition {
            id: Uuid::new_v4().to_string(),
            name: normalized_name,
            icon: None,
            color: None,
            is_system: false,
            source: super::types::DatabaseSource {
                kind: "all_notes".to_string(),
                value: String::new(),
                recursive: true,
            },
            new_note: super::types::DatabaseNewNoteConfig {
                folder: String::new(),
            },
            schema: Vec::new(),
            views: vec![default_view("Table")],
            created_at: now.clone(),
            updated_at: now,
        };
        store.databases.push(database.clone());
        save_store(&root, &store)?;
        load_database_document(&root, &database)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn databases_update(
    state: State<'_, SpaceState>,
    database: DatabaseDefinition,
) -> Result<DatabaseDocument, String> {
    let root = state.current_root()?;
    let db_store_mutex = state.db_store_mutex();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = db_store_mutex
            .lock()
            .map_err(|_| "database store mutex poisoned".to_string())?;
        let mut store = bootstrap_defaults(load_store(&root)?);
        let index = store
            .databases
            .iter()
            .position(|entry| entry.id == database.id)
            .ok_or_else(|| "database not found".to_string())?;
        let normalized_name = normalize_database_name(&database.name)?;
        if store.databases[index].is_system && normalized_name != store.databases[index].name {
            return Err("system databases cannot be renamed".to_string());
        }
        if database_name_exists(&store.databases, &normalized_name, Some(&database.id)) {
            return Err("database name already exists".to_string());
        }
        let mut next = database.clone();
        next.name = normalized_name;
        prune_unsupported_database_view_layouts(&mut next);
        next.updated_at = chrono::Utc::now().to_rfc3339();
        store.databases[index] = next.clone();
        save_store(&root, &store)?;
        load_database_document(&root, &next)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn databases_delete(
    state: State<'_, SpaceState>,
    database_id: String,
) -> Result<(), String> {
    let root = state.current_root()?;
    let db_store_mutex = state.db_store_mutex();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = db_store_mutex
            .lock()
            .map_err(|_| "database store mutex poisoned".to_string())?;
        let mut store = bootstrap_defaults(load_store(&root)?);
        if store
            .databases
            .iter()
            .find(|entry| entry.id == database_id)
            .is_some_and(|entry| entry.is_system)
        {
            return Err("system databases cannot be deleted".to_string());
        }
        store.databases.retain(|entry| entry.id != database_id);
        save_store(&root, &store)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn databases_query_rows(
    state: State<'_, SpaceState>,
    database_id: String,
    view_id: String,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<super::types::DatabaseQueryResult, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || {
        let store = bootstrap_defaults(load_store(&root)?);
        let database = store
            .databases
            .iter()
            .find(|entry| entry.id == database_id)
            .cloned()
            .ok_or_else(|| "database not found".to_string())?;
        let view = database
            .views
            .iter()
            .find(|entry| entry.id == view_id)
            .cloned()
            .ok_or_else(|| "database view not found".to_string())?;
        query_database_rows(
            &root,
            &database,
            &view,
            offset.unwrap_or(0) as usize,
            limit.unwrap_or(200).min(500) as usize,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn databases_update_cell(
    state: State<'_, SpaceState>,
    note_path: String,
    column: DatabaseColumn,
    value: DatabaseCellValue,
) -> Result<DatabaseRow, String> {
    let root = state.current_root()?;
    let recent_local_changes = state.recent_local_changes();
    tauri::async_runtime::spawn_blocking(move || {
        let existing_row = row_by_path(&root, &note_path)?;
        validate_editable_column(&existing_row, &column)?;
        let rel = PathBuf::from(&note_path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        let markdown = std::fs::read_to_string(&abs).map_err(|e| e.to_string())?;
        let next = apply_cell_update_to_markdown(&note_path, &markdown, &column, &value)?;
        write_markdown_note(&root, &recent_local_changes, &note_path, &next)?;
        row_by_path(&root, &note_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn databases_create_row(
    state: State<'_, SpaceState>,
    database_id: String,
    title: Option<String>,
) -> Result<DatabaseCreateRowResult, String> {
    let root = state.current_root()?;
    let db_store_mutex = state.db_store_mutex();
    let recent_local_changes = state.recent_local_changes();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = db_store_mutex
            .lock()
            .map_err(|_| "database store mutex poisoned".to_string())?;
        let store = bootstrap_defaults(load_store(&root)?);
        let database = store
            .databases
            .iter()
            .find(|entry| entry.id == database_id)
            .cloned()
            .ok_or_else(|| "database not found".to_string())?;
        let folder = database.new_note.folder.trim_matches('/').to_string();
        let title = title
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "Untitled".to_string());
        let slug = slugify_title(&title);
        let mut candidate = if folder.is_empty() {
            format!("{slug}.md")
        } else {
            format!("{folder}/{slug}.md")
        };
        let mut index = 2;
        loop {
            let next = create_new_row_markdown(&database, &candidate, &title)?;
            if write_new_markdown_note(&root, &recent_local_changes, &candidate, &next)? {
                break;
            }
            if index > MAX_ROW_CREATE_COLLISION_INDEX {
                return Err(format!(
                    "reached note name collision limit for slug '{slug}' in folder '{folder}'"
                ));
            }
            candidate = if folder.is_empty() {
                format!("{slug} {index}.md")
            } else {
                format!("{folder}/{slug} {index}.md")
            };
            index += 1;
        }
        let row = row_by_path(&root, &candidate)?;
        Ok(DatabaseCreateRowResult {
            note_path: candidate,
            row,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn databases_preview_context(
    state: State<'_, SpaceState>,
    note_path: String,
    _space_path: Option<String>,
) -> Result<DatabasePreviewContext, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || {
        let markdown = read_note_markdown(&root, &note_path)?;
        let row = row_by_path(&root, &note_path)?;
        let backlinks = backlink_note_paths(&root, &note_path)?;
        let line_count = markdown.lines().count() as u32;
        let word_count = word_count(&markdown);
        let character_count = markdown.chars().count() as u32;
        let reading_time_minutes = ((word_count as f32) / 200.0).ceil().max(1.0) as u32;
        Ok(DatabasePreviewContext {
            note_path,
            title: row.title,
            markdown,
            created: row.created,
            updated: row.updated,
            word_count,
            character_count,
            line_count,
            reading_time_minutes,
            backlinks,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn databases_status_colors_get(
    state: State<'_, SpaceState>,
) -> Result<BTreeMap<String, String>, String> {
    let root = state.current_root()?;
    let db_store_mutex = state.db_store_mutex();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = db_store_mutex
            .lock()
            .map_err(|_| "database store mutex poisoned".to_string())?;
        Ok(load_store(&root)?.status_colors)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn databases_status_color_set(
    state: State<'_, SpaceState>,
    status: String,
    color: Option<String>,
) -> Result<BTreeMap<String, String>, String> {
    let root = state.current_root()?;
    let db_store_mutex = state.db_store_mutex();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = db_store_mutex
            .lock()
            .map_err(|_| "database store mutex poisoned".to_string())?;
        let mut store = load_store(&root)?;
        let status_id = normalize_status_id(&status)?;
        if let Some(color) = color {
            validate_status_color(&color)?;
            store.status_colors.insert(status_id, color);
        } else {
            store.status_colors.remove(&status_id);
        }
        save_store(&root, &store)?;
        Ok(store.status_colors)
    })
    .await
    .map_err(|e| e.to_string())?
}
