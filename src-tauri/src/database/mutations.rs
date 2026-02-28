use std::path::{Path, PathBuf};

use serde_yaml::{Mapping, Number, Value};
use tauri::State;

use crate::index::{index_note, open_db};
use crate::io_atomic;
use crate::notes::frontmatter::{
    normalize_frontmatter_mapping, now_rfc3339, parse_frontmatter_mapping,
    render_frontmatter_mapping_yaml, split_frontmatter,
};
use crate::paths;
use crate::space::SpaceState;
use crate::space_fs::helpers::deny_hidden_rel_path;

use super::config::{parse_database_config, render_database_markdown};
use super::query::{hydrate_rows_by_paths, load_database, read_database_markdown};
use super::types::{
    DatabaseCellValue, DatabaseColumn, DatabaseConfig, DatabaseCreateRowResult, DatabaseRow,
};

const MAX_ROW_CREATE_COLLISION_INDEX: usize = 1_000;

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
            "number" => {
                let text = value.value_text.clone().unwrap_or_default();
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    return Ok(Value::Null);
                }
                if let Ok(int) = trimmed.parse::<i64>() {
                    return Ok(Value::Number(Number::from(int)));
                }
                let float = trimmed
                    .parse::<f64>()
                    .map_err(|_| "invalid number value".to_string())?;
                Ok(Value::Number(Number::from(float)))
            }
            "list" | "tags" => Ok(Value::Sequence(
                value
                    .value_list
                    .iter()
                    .map(|item| Value::String(item.clone()))
                    .collect(),
            )),
            "yaml" => Err("yaml columns are read-only".to_string()),
            _ => Ok(Value::String(value.value_text.clone().unwrap_or_default())),
        },
        "path" | "created" | "updated" => {
            Err(format!("{} columns are read-only", column.column_type))
        }
        other => Err(format!("unsupported column type '{other}'")),
    }
}

fn write_markdown_note(root: &Path, rel_path: &str, markdown: &str) -> Result<(), String> {
    let rel = PathBuf::from(rel_path);
    deny_hidden_rel_path(&rel)?;
    let abs = paths::join_under(root, &rel)?;
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    io_atomic::write_atomic(&abs, markdown.as_bytes()).map_err(|e| e.to_string())?;
    index_note(root, rel_path, markdown)?;
    Ok(())
}

fn note_exists(root: &Path, rel_path: &str) -> Result<bool, String> {
    let rel = PathBuf::from(rel_path);
    deny_hidden_rel_path(&rel)?;
    let abs = paths::join_under(root, &rel)?;
    Ok(abs.exists())
}

fn render_note_markdown(path: &str, markdown: &str, mapping: Mapping) -> Result<String, String> {
    let (_yaml, body) = split_frontmatter(markdown);
    let normalized = normalize_frontmatter_mapping(mapping, path, None, None);
    let rendered_yaml = render_frontmatter_mapping_yaml(&normalized)?;
    Ok(format!(
        "---\n{rendered_yaml}---\n\n{}",
        body.trim_start_matches('\n')
    ))
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
        "path" | "created" | "updated" => {
            return Err(format!("{} columns are read-only", column.column_type))
        }
        other => return Err(format!("unsupported column type '{other}'")),
    }

    render_note_markdown(note_path, markdown, mapping)
}

fn create_new_row_markdown(note_path: &str, title: &str) -> Result<String, String> {
    let now = now_rfc3339();
    let mut mapping = Mapping::new();
    mapping.insert(key("title"), Value::String(title.to_string()));
    mapping.insert(key("created"), Value::String(now.clone()));
    mapping.insert(key("updated"), Value::String(now));
    mapping.insert(key("tags"), Value::Sequence(Vec::new()));
    render_note_markdown(note_path, "", mapping)
}

fn row_by_path(root: &Path, note_path: &str) -> Result<DatabaseRow, String> {
    let conn = open_db(root)?;
    let mut rows = hydrate_rows_by_paths(&conn, &[note_path.to_string()])?;
    rows.pop()
        .ok_or_else(|| "note row not found after update".to_string())
}

fn apply_cell_value_to_row(
    mut row: DatabaseRow,
    column: &DatabaseColumn,
    value: &DatabaseCellValue,
) -> DatabaseRow {
    match column.column_type.as_str() {
        "title" => {
            row.title = value.value_text.clone().unwrap_or_default();
        }
        "tags" => {
            row.tags = value.value_list.clone();
        }
        "property" => {
            if let Some(property_key) = &column.property_key {
                row.properties.insert(property_key.clone(), value.clone());
            }
        }
        "path" | "created" | "updated" => {}
        _ => {}
    }
    row
}

#[tauri::command(rename_all = "snake_case")]
pub async fn database_load(
    state: State<'_, SpaceState>,
    path: String,
    limit: Option<u32>,
) -> Result<super::types::DatabaseLoadResult, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || load_database(&root, &path, limit))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn database_save_config(
    state: State<'_, SpaceState>,
    path: String,
    config: DatabaseConfig,
) -> Result<DatabaseConfig, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<DatabaseConfig, String> {
        let existing = read_database_markdown(&root, &path)?;
        let next = render_database_markdown(&path, &existing, &config)?;
        write_markdown_note(&root, &path, &next)?;
        Ok(config)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn database_update_cell(
    state: State<'_, SpaceState>,
    note_path: String,
    column: DatabaseColumn,
    value: DatabaseCellValue,
) -> Result<DatabaseRow, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<DatabaseRow, String> {
        let rel = PathBuf::from(&note_path);
        deny_hidden_rel_path(&rel)?;
        let abs = paths::join_under(&root, &rel)?;
        let markdown = std::fs::read_to_string(&abs).map_err(|e| e.to_string())?;
        let next = apply_cell_update_to_markdown(&note_path, &markdown, &column, &value)?;
        write_markdown_note(&root, &note_path, &next)?;
        let row = row_by_path(&root, &note_path)?;
        Ok(apply_cell_value_to_row(row, &column, &value))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        apply_cell_update_to_markdown, create_new_row_markdown, DatabaseCellValue, DatabaseColumn,
    };
    use crate::notes::frontmatter::{parse_frontmatter_mapping, split_frontmatter};
    use serde_yaml::Value;

    #[test]
    fn creates_missing_property_when_editing_blank_cell() {
        let markdown = "---\ntitle: Task\ncreated: 2024-01-01T00:00:00Z\nupdated: 2024-01-01T00:00:00Z\ntags: []\n---\n\nBody\n";
        let column = DatabaseColumn {
            id: "property:status".to_string(),
            column_type: "property".to_string(),
            label: "Status".to_string(),
            icon: Some("document".to_string()),
            width: Some(180),
            visible: true,
            property_key: Some("status".to_string()),
            property_kind: Some("text".to_string()),
        };
        let updated = apply_cell_update_to_markdown(
            "Projects/Task.md",
            markdown,
            &column,
            &DatabaseCellValue {
                kind: "text".to_string(),
                value_text: Some("In Progress".to_string()),
                value_bool: None,
                value_list: Vec::new(),
            },
        )
        .expect("property should be inserted");

        assert!(updated.contains("status: In Progress"));
    }

    #[test]
    fn creates_frontmatter_when_note_has_no_yaml() {
        let markdown = "Body only\n";
        let column = DatabaseColumn {
            id: "property:project_priority".to_string(),
            column_type: "property".to_string(),
            label: "Project priority".to_string(),
            icon: Some("flag".to_string()),
            width: Some(180),
            visible: true,
            property_key: Some("project_priority".to_string()),
            property_kind: Some("text".to_string()),
        };
        let updated = apply_cell_update_to_markdown(
            "Projects/Task.md",
            markdown,
            &column,
            &DatabaseCellValue {
                kind: "text".to_string(),
                value_text: Some("Active".to_string()),
                value_bool: None,
                value_list: Vec::new(),
            },
        )
        .expect("frontmatter should be created");

        assert!(updated.contains("project_priority: Active"));
        assert!(updated.starts_with("---\n"));
    }

    #[test]
    fn quotes_titles_when_creating_new_rows() {
        let markdown = create_new_row_markdown("Projects/Inbox Today.md", "Inbox: Today #1")
            .expect("new row markdown should render");
        let mapping = parse_frontmatter_mapping(split_frontmatter(&markdown).0)
            .expect("frontmatter should stay valid yaml");

        assert_eq!(
            mapping.get(Value::String("title".to_string())),
            Some(&Value::String("Inbox: Today #1".to_string()))
        );
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn database_create_row(
    state: State<'_, SpaceState>,
    database_path: String,
    title: Option<String>,
) -> Result<DatabaseCreateRowResult, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || -> Result<DatabaseCreateRowResult, String> {
        let database_markdown = read_database_markdown(&root, &database_path)?;
        let config = parse_database_config(&database_markdown)?;
        let folder = config.new_note.folder.trim_matches('/').to_string();
        let title = title
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| {
                let prefix = config.new_note.title_prefix.trim();
                if prefix.is_empty() {
                    "Untitled".to_string()
                } else {
                    prefix.to_string()
                }
            });
        let slug = slugify_title(&title);
        let mut candidate = if folder.is_empty() {
            format!("{slug}.md")
        } else {
            format!("{folder}/{slug}.md")
        };
        let mut index = 2;
        while note_exists(&root, &candidate)? {
            if index > MAX_ROW_CREATE_COLLISION_INDEX {
                return Err(format!(
                    "reached note name collision limit while creating database row for slug '{slug}' in folder '{folder}' (last candidate: '{candidate}', next index: {index})"
                ));
            }
            candidate = if folder.is_empty() {
                format!("{slug} {index}.md")
            } else {
                format!("{folder}/{slug} {index}.md")
            };
            index += 1;
        }

        let next = create_new_row_markdown(&candidate, &title)?;
        write_markdown_note(&root, &candidate, &next)?;
        let row = row_by_path(&root, &candidate)?;
        Ok(DatabaseCreateRowResult {
            note_path: candidate,
            row,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
