use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_yaml::Value;
use tauri::{Emitter, State, WebviewWindow};

use crate::index::open_db;
use crate::note_mutation::{commit_markdown, CommitCtx, PersistMode, SpaceChange, CHANGED_EVENT};
use crate::notes::archive::{NoteBatchFailure, NoteBatchResult};
use crate::notes::frontmatter::{parse_frontmatter_mapping, split_frontmatter};
use crate::paths;
use crate::space::SpaceState;
use crate::space_fs::helpers::{deny_hidden_rel_path, file_mtime_ms};

use super::commands::render_note_markdown;
use super::query::{
    cell_value_from_row, hydrate_rows, view_matching_ids, PropertyFields, RowFields,
};
use super::store::find_database_view;
use super::types::{DatabaseColumn, DatabaseDefinition, DatabaseViewDefinition};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseLaneRenameRequest {
    pub database_id: String,
    pub view_id: String,
    pub column: DatabaseColumn,
    pub from_values: Vec<String>,
    pub to_value: String,
    pub expected_space: String,
    pub expected_updated_at: String,
}

fn lane_property_key(column: &DatabaseColumn) -> Result<String, String> {
    if column.column_type != "property"
        || !matches!(
            column.property_kind.as_deref(),
            Some("status" | "multi_select")
        )
    {
        return Err("lanes for this column cannot be renamed".to_string());
    }
    column
        .property_key
        .as_deref()
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "property column is missing property_key".to_string())
}

/// Each row in the view with its trimmed, de-duplicated lane values, read from the index.
fn view_lane_rows(
    root: &Path,
    database: &DatabaseDefinition,
    view: &DatabaseViewDefinition,
    column: &DatabaseColumn,
) -> Result<Vec<(String, Vec<String>)>, String> {
    let key = lane_property_key(column)?;
    let conn = open_db(root)?;
    let snapshot = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let matches = view_matching_ids(&snapshot, database, view)?;
    let fields = RowFields {
        properties: PropertyFields::Keys(vec![key]),
        ..RowFields::default()
    };
    let mut out = Vec::new();
    for row in hydrate_rows(&snapshot, &matches.ids, &fields)? {
        let cell = cell_value_from_row(&row, column);
        let mut values = Vec::<String>::new();
        for value in cell.value_text.iter().chain(&cell.value_list) {
            let value = value.trim();
            if !value.is_empty() && !values.iter().any(|seen| seen == value) {
                values.push(value.to_string());
            }
        }
        if !values.is_empty() {
            out.push((row.note_path, values));
        }
    }
    Ok(out)
}

fn yaml_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(value) => Some(value.to_string()),
        _ => None,
    }
}

/// Returns the renamed frontmatter value, or `None` when the note no longer
/// holds any of the lane's values on disk.
fn renamed_value(current: &Value, from: &HashSet<String>, to: &str) -> Option<Value> {
    let rename = |item: &Value| {
        yaml_text(item)
            .filter(|text| from.contains(text.trim()))
            .map(|_| Value::String(to.to_string()))
    };
    let Value::Sequence(items) = current else {
        return rename(current);
    };
    let mut changed = false;
    let mut seen = HashSet::new();
    let mut next = Vec::new();
    for item in items {
        let item = rename(item)
            .inspect(|_| changed = true)
            .unwrap_or_else(|| item.clone());
        // Keep unrelated non-text items; dedupe text values that now collide.
        match yaml_text(&item) {
            Some(text) if !seen.insert(text.trim().to_string()) => {}
            _ => next.push(item),
        }
    }
    changed.then_some(Value::Sequence(next))
}

fn rename_note_lane(
    ctx: &CommitCtx<'_>,
    note_path: &str,
    key: &str,
    from: &HashSet<String>,
    to: &str,
) -> Result<Option<SpaceChange>, String> {
    let rel = PathBuf::from(note_path);
    deny_hidden_rel_path(&rel)?;
    let abs = paths::join_under(ctx.root, &rel)?;
    let mtime = file_mtime_ms(&abs);
    let markdown = std::fs::read_to_string(&abs).map_err(|e| e.to_string())?;
    let (yaml, _body) = split_frontmatter(&markdown);
    let mut mapping = parse_frontmatter_mapping(yaml)?;
    let property = Value::String(key.to_string());
    let Some(next) = mapping
        .get(&property)
        .and_then(|current| renamed_value(current, from, to))
    else {
        return Ok(None);
    };
    mapping.insert(property, next);
    let rendered = render_note_markdown(note_path, &markdown, mapping)?;
    if rendered == markdown {
        return Ok(None);
    }
    let committed = commit_markdown(
        ctx,
        note_path,
        &rendered,
        PersistMode::Replace {
            expected_mtime_ms: Some(mtime),
        },
    )?;
    Ok(Some(committed.change))
}

/// Card count per raw lane value across every row in the view.
#[tauri::command(rename_all = "snake_case")]
pub async fn databases_lane_values(
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    database_id: String,
    view_id: String,
    column: DatabaseColumn,
) -> Result<BTreeMap<String, u32>, String> {
    let root = state.root_for_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (database, view) = find_database_view(&root, &database_id, &view_id)?;
        let mut counts = BTreeMap::<String, u32>::new();
        for (_, values) in view_lane_rows(&root, &database, &view, &column)? {
            for value in values {
                *counts.entry(value).or_default() += 1;
            }
        }
        Ok(counts)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn databases_rename_lane(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, SpaceState>,
    request: DatabaseLaneRenameRequest,
) -> Result<NoteBatchResult, String> {
    let root = state.root_for_window(&window)?;
    let space_path = root.to_string_lossy().to_string();
    if space_path != request.expected_space {
        return Err("Space changed before renaming the lane".to_string());
    }
    let key = lane_property_key(&request.column)?;
    let to = request.to_value.trim().to_string();
    let from = request
        .from_values
        .iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<HashSet<_>>();
    if to.is_empty() || from.is_empty() {
        return Err("lane rename needs a source and a target value".to_string());
    }
    let emit_space_path = space_path.clone();
    let recent = state.recent_local_changes_for_window(window.label());
    let db_store_mutex = state.db_store_mutex();
    let note_mutation_mutex = state.note_mutation_mutex();
    let (result, changes) = tauri::async_runtime::spawn_blocking(move || {
        // Holding the store lock keeps the view definition fixed for the whole rename.
        let _store_guard = db_store_mutex
            .lock()
            .map_err(|_| "database store mutex poisoned".to_string())?;
        let _note_guard = note_mutation_mutex
            .lock()
            .map_err(|_| "note mutation mutex poisoned".to_string())?;
        let (database, view) = find_database_view(&root, &request.database_id, &request.view_id)?;
        if database.updated_at != request.expected_updated_at {
            return Err("collection changed since it was opened".to_string());
        }
        let rows = view_lane_rows(&root, &database, &view, &request.column)?;
        let ctx = CommitCtx {
            root: &root,
            recent: &recent,
            space_path: &space_path,
        };
        let mut result = NoteBatchResult {
            changed_paths: Vec::new(),
            failures: Vec::new(),
        };
        let mut changes = Vec::new();
        for (path, values) in rows {
            if !values.iter().any(|value| from.contains(value)) {
                continue;
            }
            match rename_note_lane(&ctx, &path, &key, &from, &to) {
                Ok(Some(change)) => {
                    changes.push(change);
                    result.changed_paths.push(path);
                }
                Ok(None) => {}
                Err(error) => result.failures.push(NoteBatchFailure { path, error }),
            }
        }
        Ok((result, changes))
    })
    .await
    .map_err(|e| e.to_string())??;
    if !changes.is_empty() {
        // Each window filters this typed event by space_path.
        let _ = app.emit(CHANGED_EVENT, SpaceChange::batch(emit_space_path, changes));
    }
    Ok(result)
}
