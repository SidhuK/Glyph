use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};

use crate::index::commands::parse_raw_search_query;
use crate::index::open_db;
use crate::index::search_advanced::run_search_advanced;
use crate::index::tags::{normalize_tag, tag_matches_hierarchy};
use crate::paths;
use crate::space_fs::helpers::deny_hidden_rel_path;

use super::types::{
    DatabaseCellValue, DatabaseColumn, DatabaseDefinition, DatabaseDocument,
    DatabasePropertyOption, DatabaseQueryResult, DatabaseRow, DatabaseViewDefinition,
};

const SOURCE_SCAN_LIMIT: usize = 2_000;
const SQLITE_BATCH_SIZE: usize = 500;

fn built_in_columns() -> Vec<DatabaseColumn> {
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

fn normalize_text(value: &str) -> String {
    value.trim().to_lowercase()
}

fn normalize_tag_text(value: &str) -> String {
    normalize_tag(value).unwrap_or_default()
}

fn parent_dir(path: &str) -> String {
    Path::new(path)
        .parent()
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "/".to_string())
}

fn cell_value_from_row(row: &DatabaseRow, column: &DatabaseColumn) -> DatabaseCellValue {
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

fn cell_text_values(cell: &DatabaseCellValue) -> Vec<String> {
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

fn date_matches_shortcut(value: &str, shortcut: &str) -> bool {
    let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(value) else {
        return false;
    };
    let date = parsed.with_timezone(&chrono::Local).date_naive();
    let today = chrono::Local::now().date_naive();
    match normalize_text(shortcut).as_str() {
        "today" => date == today,
        "yesterday" => date == today - chrono::Days::new(1),
        "last 7 days" => date >= today - chrono::Days::new(6) && date <= today,
        "last 30 days" => date >= today - chrono::Days::new(29) && date <= today,
        _ => false,
    }
}

fn row_matches_filters(
    row: &DatabaseRow,
    columns: &[DatabaseColumn],
    filters: &[super::types::DatabaseFilter],
) -> bool {
    filters.iter().all(|filter| {
        if filter.operator == "within_last_7_days" {
            let Some(column) = columns.iter().find(|entry| entry.id == filter.column_id) else {
                return true;
            };
            let cell = cell_value_from_row(row, column);
            let Some(value) = cell.value_text.as_deref() else {
                return false;
            };
            return date_matches_shortcut(
                value,
                filter.value_text.as_deref().unwrap_or("Last 7 Days"),
            );
        }
        let Some(column) = columns.iter().find(|entry| entry.id == filter.column_id) else {
            return true;
        };
        let cell = cell_value_from_row(row, column);
        let is_tags_column =
            column.column_type == "tags" || column.property_kind.as_deref() == Some("tags");
        let filter_text = if is_tags_column {
            normalize_tag_text(filter.value_text.as_deref().unwrap_or_default())
        } else {
            normalize_text(filter.value_text.as_deref().unwrap_or_default())
        };
        let text_values: Vec<String> = if is_tags_column {
            cell.value_list
                .iter()
                .map(|v| normalize_tag_text(v))
                .filter(|v| !v.is_empty())
                .collect()
        } else {
            cell_text_values(&cell)
        };
        match filter.operator.as_str() {
            "equals" => {
                !filter_text.is_empty() && text_values.iter().any(|value| value == &filter_text)
            }
            "not_equals" => {
                filter_text.is_empty() || text_values.iter().all(|value| value != &filter_text)
            }
            "contains" => {
                filter_text.is_empty()
                    || text_values.iter().any(|value| value.contains(&filter_text))
            }
            "not_contains" => {
                filter_text.is_empty()
                    || text_values
                        .iter()
                        .all(|value| !value.contains(&filter_text))
            }
            "starts_with" => {
                filter_text.is_empty()
                    || text_values
                        .iter()
                        .any(|value| value.starts_with(&filter_text))
            }
            "ends_with" => {
                filter_text.is_empty()
                    || text_values
                        .iter()
                        .any(|value| value.ends_with(&filter_text))
            }
            "tags_contains" => {
                if filter_text.is_empty() {
                    return true;
                }
                cell.value_list
                    .iter()
                    .map(|tag| normalize_tag_text(tag))
                    .any(|tag| !tag.is_empty() && tag_matches_hierarchy(&filter_text, &tag))
            }
            "is_empty" => text_values.is_empty() && cell.value_bool.is_none(),
            "is_not_empty" => !text_values.is_empty() || cell.value_bool.is_some(),
            "is_true" => cell.value_bool == Some(true),
            "is_false" => cell.value_bool == Some(false),
            "any_of" => {
                let filter_values = if filter.value_list.is_empty() {
                    filter
                        .value_text
                        .clone()
                        .map(|value| vec![value])
                        .unwrap_or_default()
                } else {
                    filter.value_list.clone()
                };
                if filter_values.is_empty() {
                    return true;
                }
                filter_values.iter().any(|value| {
                    let normalized = if is_tags_column {
                        normalize_tag_text(value)
                    } else {
                        normalize_text(value)
                    };
                    text_values.iter().any(|cell_value| {
                        if is_tags_column {
                            !normalized.is_empty()
                                && tag_matches_hierarchy(&normalized, cell_value)
                        } else {
                            cell_value == &normalized
                        }
                    })
                })
            }
            "none_of" => {
                let filter_values = if filter.value_list.is_empty() {
                    filter
                        .value_text
                        .clone()
                        .map(|value| vec![value])
                        .unwrap_or_default()
                } else {
                    filter.value_list.clone()
                };
                filter_values.iter().all(|value| {
                    let normalized = if is_tags_column {
                        normalize_tag_text(value)
                    } else {
                        normalize_text(value)
                    };
                    text_values.iter().all(|cell_value| {
                        if is_tags_column {
                            normalized.is_empty()
                                || !tag_matches_hierarchy(&normalized, cell_value)
                        } else {
                            cell_value != &normalized
                        }
                    })
                })
            }
            _ => true,
        }
    })
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

fn compare_rows(
    left: &DatabaseRow,
    right: &DatabaseRow,
    column: &DatabaseColumn,
) -> std::cmp::Ordering {
    let left_cell = cell_value_from_row(left, column);
    let right_cell = cell_value_from_row(right, column);
    match left_cell.kind.as_str() {
        "number" => {
            let left_number = left_cell
                .value_text
                .as_deref()
                .and_then(|value| value.trim().parse::<f64>().ok());
            let right_number = right_cell
                .value_text
                .as_deref()
                .and_then(|value| value.trim().parse::<f64>().ok());
            match (left_number, right_number) {
                (Some(left_number), Some(right_number)) => left_number
                    .partial_cmp(&right_number)
                    .unwrap_or(std::cmp::Ordering::Equal),
                (Some(_), None) => std::cmp::Ordering::Greater,
                (None, Some(_)) => std::cmp::Ordering::Less,
                (None, None) => std::cmp::Ordering::Equal,
            }
        }
        "date" | "datetime" => {
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
            match (left_date, right_date) {
                (Some(left_date), Some(right_date)) => left_date.cmp(&right_date),
                (Some(_), None) => std::cmp::Ordering::Greater,
                (None, Some(_)) => std::cmp::Ordering::Less,
                (None, None) => std::cmp::Ordering::Equal,
            }
        }
        "checkbox" => left_cell.value_bool.cmp(&right_cell.value_bool),
        _ => string_cell(&left_cell)
            .to_lowercase()
            .cmp(&string_cell(&right_cell).to_lowercase()),
    }
}

fn all_notes_source_ids(conn: &Connection, limit: usize) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM notes ORDER BY updated DESC LIMIT ?")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([limit as i64]).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        out.push(row.get::<_, String>(0).map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn direct_folder_clause(dir: &str) -> (String, Vec<String>) {
    if dir.is_empty() {
        return ("instr(id, '/') = 0".to_string(), Vec::new());
    }
    let char_len = dir.chars().count();
    (
        "id LIKE ? AND instr(substr(id, ?), '/') = 0".to_string(),
        vec![format!("{dir}/%"), (char_len + 2).to_string()],
    )
}

fn recursive_folder_clause(dir: &str) -> (String, Vec<String>) {
    if dir.is_empty() {
        return ("1 = 1".to_string(), Vec::new());
    }
    ("id LIKE ?".to_string(), vec![format!("{dir}/%")])
}

fn folder_source_ids(
    conn: &Connection,
    dir: &str,
    recursive: bool,
    limit: usize,
) -> Result<Vec<String>, String> {
    let (where_sql, bind_values) = if recursive {
        recursive_folder_clause(dir)
    } else {
        direct_folder_clause(dir)
    };
    let sql = format!("SELECT id FROM notes WHERE {where_sql} ORDER BY updated DESC LIMIT ?");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut bind_params: Vec<rusqlite::types::Value> = bind_values
        .into_iter()
        .map(rusqlite::types::Value::from)
        .collect();
    bind_params.push(rusqlite::types::Value::from(limit as i64));
    let mut rows = stmt
        .query(rusqlite::params_from_iter(bind_params.iter()))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        out.push(row.get::<_, String>(0).map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn tag_source_ids(conn: &Connection, tag: &str, limit: usize) -> Result<Vec<String>, String> {
    let normalized = tag.trim().trim_start_matches('#').to_lowercase();
    let mut stmt = conn
        .prepare(
            "SELECT n.id
             FROM tags t
             JOIN notes n ON n.id = t.note_id
             WHERE t.tag = ?
             ORDER BY n.updated DESC
             LIMIT ?",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(params![normalized, limit as i64])
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        out.push(row.get::<_, String>(0).map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn search_source_ids(conn: &Connection, query: &str, limit: usize) -> Result<Vec<String>, String> {
    let request = parse_raw_search_query(query, Some(limit as u32));
    Ok(run_search_advanced(conn, request)?
        .into_iter()
        .map(|result| result.id)
        .collect())
}

fn source_ids(
    conn: &Connection,
    database: &DatabaseDefinition,
    limit: usize,
) -> Result<Vec<String>, String> {
    match database.source.kind.as_str() {
        "all_notes" => all_notes_source_ids(conn, limit),
        "folder" => folder_source_ids(
            conn,
            database.source.value.trim_matches('/'),
            database.source.recursive,
            limit,
        ),
        "tag" => tag_source_ids(conn, &database.source.value, limit),
        "search" => search_source_ids(conn, &database.source.value, limit),
        other => Err(format!("unsupported database source kind '{other}'")),
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
        "list" | "tags" | "relation" => DatabaseCellValue {
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

fn hydrate_rows_by_paths(
    conn: &Connection,
    note_paths: &[String],
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

        let mut link_stmt = conn
            .prepare(&format!(
                "SELECT from_id, to_id FROM links WHERE from_id IN ({placeholders}) AND to_id IS NOT NULL"
            ))
            .map_err(|e| e.to_string())?;
        let mut link_rows = link_stmt
            .query(rusqlite::params_from_iter(chunk.iter()))
            .map_err(|e| e.to_string())?;
        while let Some(row) = link_rows.next().map_err(|e| e.to_string())? {
            let note_id = row.get::<_, String>(0).map_err(|e| e.to_string())?;
            let target = row.get::<_, String>(1).map_err(|e| e.to_string())?;
            if let Some(entry) = row_map.get_mut(&note_id) {
                entry.linked_notes.push(target);
            }
        }

        let mut prop_stmt = conn
            .prepare(&format!(
                "SELECT note_id, key, value_type, value_text, value_json
                 FROM note_properties
                 WHERE note_id IN ({placeholders})
                 ORDER BY ordinal ASC"
            ))
            .map_err(|e| e.to_string())?;
        let mut prop_rows = prop_stmt
            .query(rusqlite::params_from_iter(chunk.iter()))
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

fn collect_available_properties(rows: &[DatabaseRow]) -> Vec<DatabasePropertyOption> {
    let mut counts = BTreeMap::<String, (String, u32)>::new();
    for row in rows {
        for (key, value) in &row.properties {
            if matches!(
                key.as_str(),
                "title" | "created" | "updated" | "tags" | "glyph"
            ) {
                continue;
            }
            let entry = counts
                .entry(key.clone())
                .or_insert_with(|| (value.kind.clone(), 0));
            entry.1 += 1;
        }
    }
    counts
        .into_iter()
        .map(|(key, (kind, count))| DatabasePropertyOption { key, kind, count })
        .collect()
}

pub fn load_database_document(
    root: &Path,
    database: &DatabaseDefinition,
) -> Result<DatabaseDocument, String> {
    let conn = open_db(root)?;
    let ids = source_ids(&conn, database, SOURCE_SCAN_LIMIT)?;
    let rows = hydrate_rows_by_paths(&conn, &ids)?;
    Ok(DatabaseDocument {
        database: database.clone(),
        available_properties: collect_available_properties(&rows),
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
    let ids = source_ids(&conn, database, SOURCE_SCAN_LIMIT)?;
    let mut rows = hydrate_rows_by_paths(&conn, &ids)?;
    let catalog = field_catalog(database, view);
    rows.retain(|row| row_matches_filters(row, &catalog, &view.filters));
    if !view.sorts.is_empty() {
        rows.sort_by(|left, right| left.note_path.cmp(&right.note_path));
        for sort in view.sorts.iter().rev() {
            if let Some(column) = catalog.iter().find(|entry| entry.id == sort.column_id) {
                rows.sort_by(|left, right| {
                    let ordering = compare_rows(left, right, column);
                    if sort.direction == "desc" {
                        ordering.reverse()
                    } else {
                        ordering
                    }
                });
            }
        }
    }
    let total_count = rows.len() as u32;
    let sliced = rows
        .iter()
        .skip(offset)
        .take(limit)
        .cloned()
        .collect::<Vec<_>>();
    let next_offset = if offset + sliced.len() < rows.len() {
        Some((offset + sliced.len()) as u32)
    } else {
        None
    };
    Ok(DatabaseQueryResult {
        available_properties: collect_available_properties(&rows),
        total_count,
        next_offset,
        truncated: ids.len() >= SOURCE_SCAN_LIMIT,
        rows: sliced,
    })
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use rusqlite::Connection;

    use crate::index::schema::ensure_schema;

    use super::{row_matches_filters, tag_source_ids};
    use super::super::types::{DatabaseColumn, DatabaseFilter, DatabaseRow};

    fn tags_column() -> DatabaseColumn {
        DatabaseColumn {
            id: "tags".to_string(),
            column_type: "tags".to_string(),
            label: "Tags".to_string(),
            icon: None,
            width: None,
            visible: true,
            property_key: None,
            property_kind: None,
        }
    }

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
    fn tag_filters_match_descendant_explicit_tags() {
        let columns = vec![tags_column()];
        let row = sample_row(vec!["work/today/further"]);
        let filters = vec![DatabaseFilter {
            column_id: "tags".to_string(),
            operator: "tags_contains".to_string(),
            value_text: Some("#work".to_string()),
            value_bool: None,
            value_list: Vec::new(),
        }];

        assert!(row_matches_filters(&row, &columns, &filters));

        let non_matching_filters = vec![DatabaseFilter {
            column_id: "tags".to_string(),
            operator: "tags_contains".to_string(),
            value_text: Some("#personal".to_string()),
            value_bool: None,
            value_list: Vec::new(),
        }];
        assert!(!row_matches_filters(&row, &columns, &non_matching_filters));
    }

    #[test]
    fn database_tag_sources_include_descendants() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        for (id, title, updated) in [
            ("notes/root.md", "Root", "2026-03-24T10:00:00Z"),
            ("notes/child.md", "Child", "2026-03-24T11:00:00Z"),
        ] {
            conn.execute(
                "INSERT INTO notes(id, title, created, updated, path, etag, preview)
                 VALUES(?, ?, ?, ?, ?, 'etag', '')",
                rusqlite::params![id, title, updated, updated, id],
            )
            .unwrap();
        }

        for (note_id, tag, is_explicit) in [
            ("notes/root.md", "work", 1),
            ("notes/child.md", "work", 0),
            ("notes/child.md", "work/today", 1),
        ] {
            conn.execute(
                "INSERT INTO tags(note_id, tag, is_explicit) VALUES(?, ?, ?)",
                rusqlite::params![note_id, tag, is_explicit],
            )
            .unwrap();
        }

        assert_eq!(
            tag_source_ids(&conn, "#work", 10).unwrap(),
            vec!["notes/child.md".to_string(), "notes/root.md".to_string()]
        );
        assert_eq!(
            tag_source_ids(&conn, "#work/today", 10).unwrap(),
            vec!["notes/child.md".to_string()]
        );
    }
}

pub fn row_by_path(root: &Path, note_path: &str) -> Result<DatabaseRow, String> {
    let conn = open_db(root)?;
    let mut rows = hydrate_rows_by_paths(&conn, &[note_path.to_string()])?;
    rows.pop()
        .ok_or_else(|| "note row not found after update".to_string())
}

pub fn read_note_markdown(root: &Path, path: &str) -> Result<String, String> {
    let rel = PathBuf::from(path);
    deny_hidden_rel_path(&rel)?;
    let abs = paths::join_under(root, &rel)?;
    std::fs::read_to_string(abs).map_err(|e| e.to_string())
}
