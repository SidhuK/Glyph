use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::index::open_db;
use crate::paths;
use crate::space_fs::helpers::deny_hidden_rel_path;

use super::filter::row_matches_filters;
use super::source::{source_ids, SourceIds};
use super::types::{
    DatabaseCellValue, DatabaseColumn, DatabaseDefinition, DatabaseDocument,
    DatabasePropertyOption, DatabaseQueryResult, DatabaseRow, DatabaseViewDefinition,
};

const SQLITE_BATCH_SIZE: usize = 500;
const EVALUATION_BATCH_SIZE: usize = 2_000;

#[derive(Default)]
pub(super) enum PropertyFields {
    #[default]
    None,
    Keys(Vec<String>),
    All,
}

#[derive(Default)]
pub(super) struct RowFields {
    pub tags: bool,
    pub links: bool,
    pub properties: PropertyFields,
}

impl RowFields {
    pub(super) fn all() -> Self {
        Self {
            tags: true,
            links: true,
            properties: PropertyFields::All,
        }
    }
}

pub(crate) fn built_in_columns() -> Vec<DatabaseColumn> {
    vec![
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
            id: "path".to_string(),
            column_type: "path".to_string(),
            label: "Path".to_string(),
            icon: Some("link".to_string()),
            width: Some(260),
            visible: true,
            property_key: None,
            property_kind: None,
        },
        DatabaseColumn {
            id: "folder".to_string(),
            column_type: "folder".to_string(),
            label: "Folder".to_string(),
            icon: Some("folder".to_string()),
            width: Some(220),
            visible: true,
            property_key: None,
            property_kind: None,
        },
        DatabaseColumn {
            id: "created".to_string(),
            column_type: "created".to_string(),
            label: "Created".to_string(),
            icon: Some("calendar".to_string()),
            width: Some(180),
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
            id: "linked_notes".to_string(),
            column_type: "linked_notes".to_string(),
            label: "Linked Notes".to_string(),
            icon: Some("link".to_string()),
            width: Some(220),
            visible: true,
            property_key: None,
            property_kind: Some("relation".to_string()),
        },
    ]
}

fn field_catalog(
    database: &DatabaseDefinition,
    view: &DatabaseViewDefinition,
) -> Vec<DatabaseColumn> {
    let mut out = built_in_columns();
    for field in &database.schema {
        if out.iter().any(|entry| entry.id == field.id) {
            continue;
        }
        out.push(DatabaseColumn {
            id: field.id.clone(),
            column_type: "property".to_string(),
            label: field.label.clone(),
            icon: None,
            width: Some(180),
            visible: false,
            property_key: field.property_key.clone(),
            property_kind: Some(field.kind.clone()),
        });
    }
    for column in &view.columns {
        if out.iter().any(|entry| entry.id == column.id) {
            continue;
        }
        out.push(column.clone());
    }
    out
}

pub(super) fn normalize_text(value: &str) -> String {
    value.trim().to_lowercase()
}

fn parent_dir(path: &str) -> String {
    Path::new(path)
        .parent()
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "/".to_string())
}

pub(super) fn cell_value_from_row(row: &DatabaseRow, column: &DatabaseColumn) -> DatabaseCellValue {
    match column.column_type.as_str() {
        "title" => DatabaseCellValue {
            kind: "text".to_string(),
            value_text: Some(row.title.clone()),
            value_bool: None,
            value_list: Vec::new(),
        },
        "path" => DatabaseCellValue {
            kind: "text".to_string(),
            value_text: Some(row.note_path.clone()),
            value_bool: None,
            value_list: Vec::new(),
        },
        "folder" => DatabaseCellValue {
            kind: "text".to_string(),
            value_text: Some(row.folder.clone()),
            value_bool: None,
            value_list: Vec::new(),
        },
        "created" => DatabaseCellValue {
            kind: "datetime".to_string(),
            value_text: Some(row.created.clone()),
            value_bool: None,
            value_list: Vec::new(),
        },
        "updated" => DatabaseCellValue {
            kind: "datetime".to_string(),
            value_text: Some(row.updated.clone()),
            value_bool: None,
            value_list: Vec::new(),
        },
        "tags" => DatabaseCellValue {
            kind: "tags".to_string(),
            value_text: None,
            value_bool: None,
            value_list: row.tags.clone(),
        },
        "linked_notes" => DatabaseCellValue {
            kind: "relation".to_string(),
            value_text: None,
            value_bool: None,
            value_list: row.linked_notes.clone(),
        },
        "property" => row
            .properties
            .get(column.property_key.as_deref().unwrap_or_default())
            .cloned()
            .unwrap_or(DatabaseCellValue {
                kind: column
                    .property_kind
                    .clone()
                    .unwrap_or_else(|| "text".to_string()),
                value_text: None,
                value_bool: None,
                value_list: Vec::new(),
            }),
        _ => DatabaseCellValue {
            kind: "text".to_string(),
            value_text: None,
            value_bool: None,
            value_list: Vec::new(),
        },
    }
}

pub(super) fn cell_text_values(cell: &DatabaseCellValue) -> Vec<String> {
    let mut values = Vec::new();
    if let Some(value) = &cell.value_text {
        let normalized = normalize_text(value);
        if !normalized.is_empty() {
            values.push(normalized);
        }
    }
    for value in &cell.value_list {
        let normalized = normalize_text(value);
        if !normalized.is_empty() {
            values.push(normalized);
        }
    }
    if let Some(value) = cell.value_bool {
        values.push(if value { "true" } else { "false" }.to_string());
    }
    values
}

fn string_cell(cell: &DatabaseCellValue) -> String {
    if let Some(value) = &cell.value_text {
        return value.clone();
    }
    if !cell.value_list.is_empty() {
        return cell.value_list.join(", ");
    }
    if let Some(value) = cell.value_bool {
        return if value { "true" } else { "false" }.to_string();
    }
    String::new()
}

fn row_matches_search(row: &DatabaseRow, search: &str) -> bool {
    let terms = search
        .split_whitespace()
        .map(normalize_text)
        .filter(|term| !term.is_empty())
        .collect::<Vec<_>>();
    if terms.is_empty() {
        return true;
    }

    let mut text = vec![
        row.title.as_str(),
        row.note_path.as_str(),
        row.folder.as_str(),
        row.preview.as_str(),
    ]
    .join(" ");
    if !row.tags.is_empty() {
        text.push(' ');
        text.push_str(&row.tags.join(" "));
    }
    if !row.linked_notes.is_empty() {
        text.push(' ');
        text.push_str(&row.linked_notes.join(" "));
    }
    for value in row
        .properties
        .values()
        .map(string_cell)
        .filter(|v| !v.is_empty())
    {
        text.push(' ');
        text.push_str(&value);
    }

    let haystack = normalize_text(&text);
    terms.iter().all(|term| haystack.contains(term))
}

fn parse_sort_number(value: &str) -> Option<f64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let parsed = trimmed.parse::<f64>().ok()?;
    parsed.is_finite().then_some(parsed)
}

fn order_for_direction(ordering: std::cmp::Ordering, descending: bool) -> std::cmp::Ordering {
    if descending {
        ordering.reverse()
    } else {
        ordering
    }
}

fn compare_text_cells(left: &str, right: &str, descending: bool) -> std::cmp::Ordering {
    let left_number = parse_sort_number(left);
    let right_number = parse_sort_number(right);
    match (left_number, right_number) {
        (Some(left_number), Some(right_number)) => order_for_direction(
            left_number
                .total_cmp(&right_number)
                .then_with(|| normalize_text(left).cmp(&normalize_text(right))),
            descending,
        ),
        (Some(_), None) => order_for_direction(std::cmp::Ordering::Less, descending),
        (None, Some(_)) => order_for_direction(std::cmp::Ordering::Greater, descending),
        (None, None) => {
            order_for_direction(normalize_text(left).cmp(&normalize_text(right)), descending)
        }
    }
}

fn compare_rows(
    left: &DatabaseRow,
    right: &DatabaseRow,
    column: &DatabaseColumn,
    descending: bool,
) -> std::cmp::Ordering {
    let left_cell = cell_value_from_row(left, column);
    let right_cell = cell_value_from_row(right, column);
    match left_cell.kind.as_str() {
        "date" => {
            let left_date = left_cell
                .value_text
                .as_deref()
                .and_then(|value| chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").ok());
            let right_date = right_cell
                .value_text
                .as_deref()
                .and_then(|value| chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").ok());
            order_for_direction(
                match (left_date, right_date) {
                    (Some(left_date), Some(right_date)) => left_date.cmp(&right_date),
                    (Some(_), None) => std::cmp::Ordering::Greater,
                    (None, Some(_)) => std::cmp::Ordering::Less,
                    (None, None) => std::cmp::Ordering::Equal,
                },
                descending,
            )
        }
        "datetime" => {
            let left_date = left_cell
                .value_text
                .as_deref()
                .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
                .map(|value| value.with_timezone(&chrono::Local));
            let right_date = right_cell
                .value_text
                .as_deref()
                .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
                .map(|value| value.with_timezone(&chrono::Local));
            order_for_direction(
                match (left_date, right_date) {
                    (Some(left_date), Some(right_date)) => left_date.cmp(&right_date),
                    (Some(_), None) => std::cmp::Ordering::Greater,
                    (None, Some(_)) => std::cmp::Ordering::Less,
                    (None, None) => std::cmp::Ordering::Equal,
                },
                descending,
            )
        }
        "checkbox" => {
            order_for_direction(left_cell.value_bool.cmp(&right_cell.value_bool), descending)
        }
        _ => compare_text_cells(
            &string_cell(&left_cell),
            &string_cell(&right_cell),
            descending,
        ),
    }
}

fn property_value_from_index(
    value_type: &str,
    value_text: String,
    value_json: String,
) -> DatabaseCellValue {
    match value_type {
        "checkbox" => DatabaseCellValue {
            kind: value_type.to_string(),
            value_text: None,
            value_bool: serde_json::from_str::<bool>(&value_json).ok(),
            value_list: Vec::new(),
        },
        "tags" | "relation" => DatabaseCellValue {
            kind: value_type.to_string(),
            value_text: None,
            value_bool: None,
            value_list: serde_json::from_str::<Vec<String>>(&value_json).unwrap_or_default(),
        },
        _ => DatabaseCellValue {
            kind: value_type.to_string(),
            value_text: Some(value_text),
            value_bool: None,
            value_list: Vec::new(),
        },
    }
}

pub(super) fn hydrate_rows(
    conn: &Connection,
    note_paths: &[String],
    fields: &RowFields,
) -> Result<Vec<DatabaseRow>, String> {
    if note_paths.is_empty() {
        return Ok(Vec::new());
    }
    let mut row_map = HashMap::<String, DatabaseRow>::new();
    for chunk in note_paths.chunks(SQLITE_BATCH_SIZE) {
        let placeholders = std::iter::repeat_n("?", chunk.len())
            .collect::<Vec<_>>()
            .join(", ");
        let mut stmt = conn
            .prepare(&format!(
                "SELECT id, title, created, updated, preview FROM notes WHERE id IN ({placeholders})"
            ))
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(rusqlite::params_from_iter(chunk.iter()))
            .map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let note_path = row.get::<_, String>(0).map_err(|e| e.to_string())?;
            row_map.insert(
                note_path.clone(),
                DatabaseRow {
                    folder: parent_dir(&note_path),
                    note_path,
                    title: row.get(1).map_err(|e| e.to_string())?,
                    created: row.get(2).map_err(|e| e.to_string())?,
                    updated: row.get(3).map_err(|e| e.to_string())?,
                    preview: row.get(4).map_err(|e| e.to_string())?,
                    tags: Vec::new(),
                    linked_notes: Vec::new(),
                    properties: BTreeMap::new(),
                },
            );
        }

        if fields.tags {
            let mut tag_stmt = conn
                .prepare(&format!(
                    "SELECT note_id, tag
                 FROM tags
                 WHERE note_id IN ({placeholders}) AND is_explicit = 1
                 ORDER BY tag ASC"
                ))
                .map_err(|e| e.to_string())?;
            let mut tag_rows = tag_stmt
                .query(rusqlite::params_from_iter(chunk.iter()))
                .map_err(|e| e.to_string())?;
            while let Some(row) = tag_rows.next().map_err(|e| e.to_string())? {
                let note_id = row.get::<_, String>(0).map_err(|e| e.to_string())?;
                let tag = row.get::<_, String>(1).map_err(|e| e.to_string())?;
                if let Some(entry) = row_map.get_mut(&note_id) {
                    entry.tags.push(tag);
                }
            }
        }

        if fields.links {
            let mut link_stmt = conn
                .prepare(&format!(
                    "SELECT from_id, to_id, to_title FROM links
                 WHERE from_id IN ({placeholders}) AND (to_id IS NOT NULL OR to_title IS NOT NULL)"
                ))
                .map_err(|e| e.to_string())?;
            let mut link_rows = link_stmt
                .query(rusqlite::params_from_iter(chunk.iter()))
                .map_err(|e| e.to_string())?;
            while let Some(row) = link_rows.next().map_err(|e| e.to_string())? {
                let note_id = row.get::<_, String>(0).map_err(|e| e.to_string())?;
                let to_id = row
                    .get::<_, Option<String>>(1)
                    .map_err(|e| e.to_string())?
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty());
                let to_title = row
                    .get::<_, Option<String>>(2)
                    .map_err(|e| e.to_string())?
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty());
                let Some(target) = to_id.or(to_title) else {
                    continue;
                };
                if let Some(entry) = row_map.get_mut(&note_id) {
                    entry.linked_notes.push(target);
                }
            }
        }

        let key_filter: &[String] = match &fields.properties {
            PropertyFields::None => continue,
            PropertyFields::All => &[],
            PropertyFields::Keys(keys) if keys.is_empty() => continue,
            PropertyFields::Keys(keys) => keys,
        };
        let key_clause = if key_filter.is_empty() {
            String::new()
        } else {
            format!(
                " AND key IN ({})",
                std::iter::repeat_n("?", key_filter.len())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        };
        let mut prop_stmt = conn
            .prepare(&format!(
                "SELECT note_id, key, value_type, value_text, value_json
                 FROM note_properties
                 WHERE note_id IN ({placeholders}){key_clause}
                 ORDER BY ordinal ASC"
            ))
            .map_err(|e| e.to_string())?;
        let mut prop_rows = prop_stmt
            .query(rusqlite::params_from_iter(
                chunk.iter().chain(key_filter.iter()),
            ))
            .map_err(|e| e.to_string())?;
        while let Some(row) = prop_rows.next().map_err(|e| e.to_string())? {
            let note_id = row.get::<_, String>(0).map_err(|e| e.to_string())?;
            let key = row.get::<_, String>(1).map_err(|e| e.to_string())?;
            if let Some(entry) = row_map.get_mut(&note_id) {
                entry.properties.insert(
                    key,
                    property_value_from_index(
                        &row.get::<_, String>(2).map_err(|e| e.to_string())?,
                        row.get::<_, String>(3).map_err(|e| e.to_string())?,
                        row.get::<_, String>(4).map_err(|e| e.to_string())?,
                    ),
                );
            }
        }
    }

    Ok(note_paths
        .iter()
        .filter_map(|path| row_map.remove(path))
        .collect::<Vec<_>>())
}

fn evaluation_fields(
    catalog: &[DatabaseColumn],
    view: &DatabaseViewDefinition,
) -> Option<RowFields> {
    if !view.search.trim().is_empty() {
        return Some(RowFields::all());
    }
    if view.filters.is_empty() && view.sorts.is_empty() {
        return None;
    }
    let mut fields = RowFields::default();
    let mut property_keys = Vec::new();
    let referenced = view
        .filters
        .iter()
        .map(|filter| &filter.column_id)
        .chain(view.sorts.iter().map(|sort| &sort.column_id));
    for column_id in referenced {
        let Some(column) = catalog.iter().find(|entry| &entry.id == column_id) else {
            continue;
        };
        match column.column_type.as_str() {
            "tags" => fields.tags = true,
            "linked_notes" => fields.links = true,
            "property" => {
                if let Some(key) = &column.property_key {
                    if !property_keys.contains(key) {
                        property_keys.push(key.clone());
                    }
                }
            }
            _ => {}
        }
    }
    fields.properties = PropertyFields::Keys(property_keys);
    Some(fields)
}

/// Filters, searches, and sorts the complete source set while loading only the
/// columns the view references, so pagination never sees a partial candidate set.
fn matching_ids(
    conn: &Connection,
    source: Vec<String>,
    catalog: &[DatabaseColumn],
    view: &DatabaseViewDefinition,
) -> Result<Vec<String>, String> {
    let Some(fields) = evaluation_fields(catalog, view) else {
        return Ok(source);
    };
    let mut rows = Vec::new();
    for chunk in source.chunks(EVALUATION_BATCH_SIZE) {
        let mut batch = hydrate_rows(conn, chunk, &fields)?;
        batch.retain(|row| {
            row_matches_filters(row, catalog, &view.filters)
                && row_matches_search(row, &view.search)
        });
        rows.append(&mut batch);
    }
    if !view.sorts.is_empty() {
        rows.sort_by(|left, right| left.note_path.cmp(&right.note_path));
        for sort in view.sorts.iter().rev() {
            if let Some(column) = catalog.iter().find(|entry| entry.id == sort.column_id) {
                rows.sort_by(|left, right| {
                    compare_rows(left, right, column, sort.direction == "desc")
                });
            }
        }
    }
    Ok(rows.into_iter().map(|row| row.note_path).collect())
}

pub(super) fn view_matching_ids(
    conn: &Connection,
    database: &DatabaseDefinition,
    view: &DatabaseViewDefinition,
) -> Result<SourceIds, String> {
    let mut source = source_ids(conn, database)?;
    let catalog = field_catalog(database, view);
    source.ids = matching_ids(conn, std::mem::take(&mut source.ids), &catalog, view)?;
    Ok(source)
}

fn is_hidden_property_key(key: &str) -> bool {
    matches!(key, "title" | "created" | "updated" | "tags" | "glyph")
}

fn available_properties(
    conn: &Connection,
    note_ids: &[String],
) -> Result<Vec<DatabasePropertyOption>, String> {
    let mut counts = BTreeMap::<String, BTreeMap<String, u32>>::new();
    for chunk in note_ids.chunks(SQLITE_BATCH_SIZE) {
        let placeholders = std::iter::repeat_n("?", chunk.len())
            .collect::<Vec<_>>()
            .join(", ");
        let mut stmt = conn
            .prepare(&format!(
                "SELECT key, value_type, COUNT(*)
                 FROM note_properties
                 WHERE note_id IN ({placeholders})
                 GROUP BY key, value_type"
            ))
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(rusqlite::params_from_iter(chunk.iter()))
            .map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let key = row.get::<_, String>(0).map_err(|e| e.to_string())?;
            if is_hidden_property_key(&key) {
                continue;
            }
            let kind = row.get::<_, String>(1).map_err(|e| e.to_string())?;
            let count = row.get::<_, i64>(2).map_err(|e| e.to_string())? as u32;
            *counts.entry(key).or_default().entry(kind).or_default() += count;
        }
    }
    Ok(counts
        .into_iter()
        .map(|(key, kinds)| {
            let count = kinds.values().sum();
            // Keys indexed with mixed kinds report the most common one; ties
            // resolve to the alphabetically first kind so the result is stable.
            let kind = kinds
                .iter()
                .max_by(|(left_kind, left), (right_kind, right)| {
                    left.cmp(right).then_with(|| right_kind.cmp(left_kind))
                })
                .map(|(kind, _)| kind.clone())
                .unwrap_or_default();
            DatabasePropertyOption { key, kind, count }
        })
        .collect())
}

pub fn load_database_document(
    root: &Path,
    database: &DatabaseDefinition,
) -> Result<DatabaseDocument, String> {
    let conn = open_db(root)?;
    let snapshot = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let source = source_ids(&snapshot, database)?;
    Ok(DatabaseDocument {
        database: database.clone(),
        available_properties: available_properties(&snapshot, &source.ids)?,
    })
}

pub fn query_database_rows(
    root: &Path,
    database: &DatabaseDefinition,
    view: &DatabaseViewDefinition,
    offset: usize,
    limit: usize,
) -> Result<DatabaseQueryResult, String> {
    let conn = open_db(root)?;
    // A read transaction keeps count, page, and properties on one index snapshot.
    let snapshot = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let matches = view_matching_ids(&snapshot, database, view)?;
    let total = matches.ids.len();
    let start = offset.min(total);
    let end = offset.saturating_add(limit).min(total);
    let rows = hydrate_rows(&snapshot, &matches.ids[start..end], &RowFields::all())?;
    Ok(DatabaseQueryResult {
        available_properties: available_properties(&snapshot, &matches.ids)?,
        total_count: total as u32,
        next_offset: (end < total).then_some(end as u32),
        truncated: matches.truncated,
        rows,
    })
}

pub fn row_by_path(root: &Path, note_path: &str) -> Result<DatabaseRow, String> {
    let conn = open_db(root)?;
    let mut rows = hydrate_rows(&conn, &[note_path.to_string()], &RowFields::all())?;
    rows.pop()
        .ok_or_else(|| "note row not found after update".to_string())
}

pub fn read_note_markdown(root: &Path, path: &str) -> Result<String, String> {
    let rel = PathBuf::from(path);
    deny_hidden_rel_path(&rel)?;
    let abs = paths::join_under(root, &rel)?;
    std::fs::read_to_string(abs).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::super::types::{DatabaseCellValue, DatabaseRow};
    use super::row_matches_search;

    fn sample_row(tags: Vec<&str>) -> DatabaseRow {
        DatabaseRow {
            note_path: "notes/child.md".to_string(),
            title: "Child".to_string(),
            folder: "notes".to_string(),
            created: "2026-03-24T10:00:00Z".to_string(),
            updated: "2026-03-24T10:00:00Z".to_string(),
            preview: String::new(),
            tags: tags.into_iter().map(str::to_string).collect(),
            linked_notes: Vec::new(),
            properties: BTreeMap::new(),
        }
    }

    #[test]
    fn in_view_search_matches_core_row_text() {
        let mut row = sample_row(vec!["projects/research"]);
        row.title = "Launch Brief".to_string();
        row.note_path = "projects/launch.md".to_string();
        row.folder = "projects".to_string();
        row.preview = "Collect customer interviews and launch notes.".to_string();
        row.linked_notes = vec!["people/maya.md".to_string()];

        assert!(row_matches_search(&row, "launch customer"));
        assert!(row_matches_search(&row, "projects/research"));
        assert!(row_matches_search(&row, "maya"));
        assert!(!row_matches_search(&row, "missing"));
    }

    #[test]
    fn in_view_search_matches_property_values() {
        let mut row = sample_row(Vec::new());
        row.properties.insert(
            "status".to_string(),
            DatabaseCellValue {
                kind: "status".to_string(),
                value_text: Some("In Review".to_string()),
                value_bool: None,
                value_list: Vec::new(),
            },
        );
        row.properties.insert(
            "owners".to_string(),
            DatabaseCellValue {
                kind: "tags".to_string(),
                value_text: None,
                value_bool: None,
                value_list: vec!["Design".to_string(), "Product".to_string()],
            },
        );

        assert!(row_matches_search(&row, "review product"));
    }
}
