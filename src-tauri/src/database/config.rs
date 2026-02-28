use serde::Deserialize;
use serde_yaml::{Mapping, Value};

use crate::notes::frontmatter::{
    normalize_frontmatter_mapping, parse_frontmatter_mapping, render_frontmatter_mapping_yaml,
    split_frontmatter,
};

use super::types::DatabaseConfig;
#[cfg(test)]
use super::types::{
    DatabaseColumn, DatabaseNewNoteConfig, DatabaseSource, DatabaseViewState,
};

const DATABASE_KIND: &str = "database";
const DATABASE_VERSION: i64 = 1;

fn key(name: &str) -> Value {
    Value::String(name.to_string())
}

fn get_mapping_mut<'a>(mapping: &'a mut Mapping, field: &str) -> Result<&'a mut Mapping, String> {
    let entry = mapping
        .entry(key(field))
        .or_insert_with(|| Value::Mapping(Mapping::new()));
    match entry {
        Value::Mapping(inner) => Ok(inner),
        _ => Err(format!("'{field}' must be a mapping")),
    }
}

#[cfg(test)]
fn default_columns() -> Vec<DatabaseColumn> {
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
    ]
}

#[cfg(test)]
pub fn starter_database_config(default_dir: &str) -> DatabaseConfig {
    DatabaseConfig {
        source: DatabaseSource {
            kind: "folder".to_string(),
            value: default_dir.trim_matches('/').to_string(),
            recursive: true,
        },
        new_note: DatabaseNewNoteConfig {
            folder: default_dir.trim_matches('/').to_string(),
            title_prefix: "Untitled".to_string(),
        },
        view: DatabaseViewState {
            layout: "table".to_string(),
            board_group_by: None,
        },
        columns: default_columns(),
        sorts: Vec::new(),
        filters: Vec::new(),
    }
}

#[derive(Debug, Deserialize)]
struct GlyphFrontmatter {
    #[serde(default)]
    glyph: Option<GlyphData>,
}

#[derive(Debug, Deserialize)]
struct GlyphData {
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    database: Option<DatabaseConfig>,
}

#[cfg(test)]
pub fn is_database_markdown(markdown: &str) -> bool {
    let (yaml, _) = split_frontmatter(markdown);
    let Some(yaml) = yaml else {
        return false;
    };
    serde_yaml::from_str::<GlyphFrontmatter>(yaml)
        .ok()
        .and_then(|parsed| parsed.glyph)
        .and_then(|glyph| glyph.kind)
        .is_some_and(|kind| kind == DATABASE_KIND)
}

pub fn parse_database_config(markdown: &str) -> Result<DatabaseConfig, String> {
    let (yaml, _) = split_frontmatter(markdown);
    let Some(yaml) = yaml else {
        return Err("database note is missing frontmatter".to_string());
    };
    let parsed = serde_yaml::from_str::<GlyphFrontmatter>(yaml).map_err(|e| e.to_string())?;
    let glyph = parsed
        .glyph
        .ok_or_else(|| "database note is missing glyph config".to_string())?;
    if glyph.kind.as_deref() != Some(DATABASE_KIND) {
        return Err("note is not a database note".to_string());
    }
    glyph
        .database
        .ok_or_else(|| "database note is missing glyph.database config".to_string())
}

pub fn render_database_markdown(
    path: &str,
    existing_markdown: &str,
    config: &DatabaseConfig,
) -> Result<String, String> {
    let (yaml, body) = split_frontmatter(existing_markdown);
    let mut mapping = parse_frontmatter_mapping(yaml)?;
    let glyph = get_mapping_mut(&mut mapping, "glyph")?;
    glyph.insert(key("kind"), Value::String(DATABASE_KIND.to_string()));
    glyph.insert(
        key("version"),
        Value::Number(serde_yaml::Number::from(DATABASE_VERSION)),
    );
    glyph.insert(
        key("database"),
        serde_yaml::to_value(config).map_err(|e| e.to_string())?,
    );

    let normalized = normalize_frontmatter_mapping(mapping, path, None, None);
    let rendered_yaml = render_frontmatter_mapping_yaml(&normalized)?;
    Ok(format!(
        "---\n{rendered_yaml}---\n\n{}",
        body.trim_start_matches('\n')
    ))
}

#[cfg(test)]
pub fn starter_database_markdown(
    path: &str,
    title: &str,
    default_dir: &str,
) -> Result<String, String> {
    let config = starter_database_config(default_dir);
    let base = format!("---\ntitle: {title}\n---\n\n");
    render_database_markdown(path, &base, &config)
}

#[cfg(test)]
mod tests {
    use super::{
        is_database_markdown, parse_database_config, render_database_markdown,
        starter_database_config, starter_database_markdown,
    };

    #[test]
    fn parses_database_config_from_frontmatter() {
        let markdown = r#"---
title: Projects
glyph:
  kind: database
  version: 1
  database:
    source:
      kind: folder
      value: Projects
      recursive: true
    new_note:
      folder: Projects
      title_prefix: Untitled
    view:
      layout: board
      board_group_by: property:status
    columns: []
    sorts: []
    filters: []
---

Body
"#;
        let config = parse_database_config(markdown).expect("config should parse");
        assert_eq!(config.source.kind, "folder");
        assert_eq!(config.source.value, "Projects");
        assert_eq!(config.view.layout, "board");
        assert_eq!(config.view.board_group_by.as_deref(), Some("property:status"));
        assert!(is_database_markdown(markdown));
    }

    #[test]
    fn preserves_body_when_rendering_database_markdown() {
        let existing = "---\ntitle: Projects\ncustom: value\n---\n\nHello world\n";
        let rendered = render_database_markdown(
            "Projects/Projects.md",
            existing,
            &starter_database_config("Projects"),
        )
        .expect("render should succeed");
        assert!(rendered.contains("Hello world"));
        assert!(rendered.contains("kind: database"));
        assert!(rendered.contains("custom: value"));
    }

    #[test]
    fn preserves_filters_when_round_tripping_database_config() {
        let markdown = r#"---
title: Projects
glyph:
  kind: database
  version: 1
  database:
    source:
      kind: folder
      value: Projects
      recursive: true
    new_note:
      folder: Projects
      title_prefix: Untitled
    columns: []
    sorts: []
    filters:
      - column_id: title
        operator: contains
        value_text: roadmap
---
"#;
        let config = parse_database_config(markdown).expect("config should parse");
        let rendered = render_database_markdown("Projects/Projects.md", markdown, &config)
            .expect("render should succeed");
        let reparsed = parse_database_config(&rendered).expect("config should reparse");
        assert_eq!(reparsed.filters.len(), 1);
        assert_eq!(reparsed.filters[0].column_id, "title");
        assert_eq!(reparsed.filters[0].operator, "contains");
        assert_eq!(reparsed.filters[0].value_text.as_deref(), Some("roadmap"));
    }

    #[test]
    fn preserves_column_icons_when_round_tripping_database_config() {
        let markdown = r#"---
title: Projects
glyph:
  kind: database
  version: 1
  database:
    source:
      kind: folder
      value: Projects
      recursive: true
    new_note:
      folder: Projects
      title_prefix: Untitled
    columns:
      -
        id: title
        type: title
        label: Title
        icon: document
        visible: true
      -
        id: property:status
        type: property
        label: Status
        icon: flag
        visible: true
        property_key: status
        property_kind: text
    sorts: []
    filters: []
---
"#;
        let config = parse_database_config(markdown).expect("config should parse");
        assert_eq!(config.columns[0].icon.as_deref(), Some("document"));
        assert_eq!(config.columns[1].icon.as_deref(), Some("flag"));
        let rendered = render_database_markdown("Projects/Projects.md", markdown, &config)
            .expect("render should succeed");
        let reparsed = parse_database_config(&rendered).expect("config should reparse");
        assert_eq!(reparsed.columns[0].icon.as_deref(), Some("document"));
        assert_eq!(reparsed.columns[1].icon.as_deref(), Some("flag"));
    }

    #[test]
    fn preserves_view_state_when_round_tripping_database_config() {
        let markdown = r#"---
title: Projects
glyph:
  kind: database
  version: 1
  database:
    source:
      kind: folder
      value: Projects
      recursive: true
    new_note:
      folder: Projects
      title_prefix: Untitled
    view:
      layout: board
      board_group_by: property:status
    columns: []
    sorts: []
    filters: []
---
"#;
        let config = parse_database_config(markdown).expect("config should parse");
        let rendered = render_database_markdown("Projects/Projects.md", markdown, &config)
            .expect("render should succeed");
        let reparsed = parse_database_config(&rendered).expect("config should reparse");
        assert_eq!(reparsed.view.layout, "board");
        assert_eq!(reparsed.view.board_group_by.as_deref(), Some("property:status"));
    }

    #[test]
    fn creates_starter_database_markdown() {
        let markdown = starter_database_markdown("Projects/Projects.md", "Projects", "Projects")
            .expect("starter markdown should render");
        assert!(markdown.contains("kind: database"));
        assert!(markdown.contains("folder: Projects"));
    }
}
