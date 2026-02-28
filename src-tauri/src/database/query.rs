use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};

use crate::index::commands::parse_raw_search_query;
use crate::index::open_db;
use crate::index::search_advanced::run_search_advanced;
use crate::notes::frontmatter::split_frontmatter;
use crate::paths;
use crate::space_fs::helpers::deny_hidden_rel_path;

use super::config::parse_database_config;
use super::types::{DatabaseCellValue, DatabaseLoadResult, DatabasePropertyOption, DatabaseRow};

const HARD_LIMIT: usize = 500;

fn is_reserved_property(key: &str) -> bool {
    matches!(
        key,
        "id" | "title" | "created" | "updated" | "tags" | "glyph"
    )
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
        "list" | "tags" => DatabaseCellValue {
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

fn direct_folder_clause(dir: &str) -> (String, Vec<String>) {
    if dir.is_empty() {
        return ("instr(id, '/') = 0".to_string(), Vec::new());
    }

    (
        "id LIKE ? AND instr(substr(id, ?), '/') = 0".to_string(),
        vec![format!("{dir}/%"), (dir.len() + 2).to_string()],
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
    let normalized = if tag.starts_with('#') {
        tag.to_string()
    } else {
        format!("#{tag}")
    };
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
    kind: &str,
    value: &str,
    recursive: bool,
    limit: usize,
) -> Result<Vec<String>, String> {
    match kind {
        "folder" => folder_source_ids(conn, value.trim_matches('/'), recursive, limit),
        "tag" => tag_source_ids(conn, value, limit),
        "search" => search_source_ids(conn, value, limit),
        other => Err(format!("unsupported database source kind '{other}'")),
    }
}

pub(crate) fn hydrate_rows_by_paths(
    conn: &Connection,
    note_paths: &[String],
) -> Result<Vec<DatabaseRow>, String> {
    if note_paths.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders = std::iter::repeat_n("?", note_paths.len())
        .collect::<Vec<_>>()
        .join(", ");

    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, title, created, updated, preview FROM notes WHERE id IN ({placeholders})"
        ))
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params_from_iter(note_paths.iter()))
        .map_err(|e| e.to_string())?;

    let mut row_map = HashMap::<String, DatabaseRow>::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let note_path = row.get::<_, String>(0).map_err(|e| e.to_string())?;
        row_map.insert(
            note_path.clone(),
            DatabaseRow {
                note_path,
                title: row.get(1).map_err(|e| e.to_string())?,
                created: row.get(2).map_err(|e| e.to_string())?,
                updated: row.get(3).map_err(|e| e.to_string())?,
                preview: row.get(4).map_err(|e| e.to_string())?,
                tags: Vec::new(),
                properties: BTreeMap::new(),
            },
        );
    }

    let mut tag_stmt = conn
        .prepare(&format!(
            "SELECT note_id, tag FROM tags WHERE note_id IN ({placeholders}) ORDER BY tag ASC"
        ))
        .map_err(|e| e.to_string())?;
    let mut tag_rows = tag_stmt
        .query(rusqlite::params_from_iter(note_paths.iter()))
        .map_err(|e| e.to_string())?;
    while let Some(row) = tag_rows.next().map_err(|e| e.to_string())? {
        let note_id = row.get::<_, String>(0).map_err(|e| e.to_string())?;
        let tag = row.get::<_, String>(1).map_err(|e| e.to_string())?;
        if let Some(entry) = row_map.get_mut(&note_id) {
            entry.tags.push(tag);
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
        .query(rusqlite::params_from_iter(note_paths.iter()))
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

    Ok(note_paths
        .iter()
        .filter_map(|path| row_map.remove(path))
        .collect::<Vec<_>>())
}

fn collect_available_properties(rows: &[DatabaseRow]) -> Vec<DatabasePropertyOption> {
    let mut counts = BTreeMap::<String, (String, u32)>::new();
    for row in rows {
        for (key, value) in &row.properties {
            if is_reserved_property(key) {
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

fn resolve_database_abs_path(root: &Path, database_path: &str) -> Result<PathBuf, String> {
    let rel = PathBuf::from(database_path);
    deny_hidden_rel_path(&rel)?;
    paths::join_under(root, &rel)
}

pub fn load_database(
    root: &Path,
    database_path: &str,
    limit: Option<u32>,
) -> Result<DatabaseLoadResult, String> {
    let abs = resolve_database_abs_path(root, database_path)?;
    let markdown = std::fs::read_to_string(&abs).map_err(|e| e.to_string())?;
    let config = parse_database_config(&markdown)?;
    let conn = open_db(root)?;
    let effective_limit = limit
        .unwrap_or(HARD_LIMIT as u32)
        .clamp(1, HARD_LIMIT as u32) as usize;
    let mut ids = source_ids(
        &conn,
        &config.source.kind,
        &config.source.value,
        config.source.recursive,
        effective_limit + 1,
    )?;
    ids.retain(|id| id != database_path);
    let truncated = ids.len() > effective_limit;
    if truncated {
        ids.truncate(effective_limit);
    }
    let rows = hydrate_rows_by_paths(&conn, &ids)?;
    let available_properties = collect_available_properties(&rows);
    Ok(DatabaseLoadResult {
        config,
        rows,
        available_properties,
        truncated,
        total_loaded: ids.len() as u32,
    })
}

pub fn read_database_markdown(root: &Path, path: &str) -> Result<String, String> {
    let abs = resolve_database_abs_path(root, path)?;
    let markdown = std::fs::read_to_string(&abs).map_err(|e| e.to_string())?;
    let (frontmatter, _) = split_frontmatter(&markdown);
    if frontmatter.is_none() {
        return Err("database note is missing frontmatter".to_string());
    }
    Ok(markdown)
}
