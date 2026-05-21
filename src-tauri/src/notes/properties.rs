use std::collections::HashSet;

use chrono::NaiveDate;
use serde_yaml::{Mapping, Value};

use super::frontmatter::{
    parse_frontmatter_mapping, render_frontmatter_mapping_yaml, split_frontmatter,
};
use super::types::NoteProperty;

fn raw_yaml(frontmatter: Option<&str>) -> Option<&str> {
    let text = frontmatter?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("---") {
        if let Some(rest) = trimmed.strip_prefix("---\n") {
            if let Some(bodyless) = rest.strip_suffix("\n---") {
                return Some(bodyless);
            }
        }
        if let Some(rest) = trimmed.strip_prefix("---\r\n") {
            if let Some(bodyless) = rest.strip_suffix("\r\n---") {
                return Some(bodyless);
            }
        }
        return split_frontmatter(trimmed).0;
    }
    Some(trimmed)
}

fn scalar_text(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(v) => Some(v.to_string()),
        Value::Null => Some(String::new()),
        _ => None,
    }
}

fn property_text(value: &Value) -> String {
    if let Some(text) = scalar_text(value) {
        return text;
    }
    if let Value::Sequence(items) = value {
        if let Some(joined) = items.iter().map(scalar_text).collect::<Option<Vec<_>>>() {
            return joined.join(", ");
        }
    }
    serde_yaml::to_string(value)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn infer_string_kind(value: &str) -> &'static str {
    let trimmed = value.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return "url";
    }
    if trimmed == value
        && NaiveDate::parse_from_str(trimmed, "%Y-%m-%d")
            .ok()
            .is_some_and(|parsed| parsed.format("%F").to_string() == trimmed)
    {
        return "date";
    }
    "text"
}

fn normalized_status_text(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .replace(['_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_status_key(key: &str) -> bool {
    let normalized = normalized_status_text(key);
    normalized == "status" || normalized.ends_with(" status")
}

fn is_priority_key(key: &str) -> bool {
    let normalized = normalized_status_text(key);
    normalized == "priority" || normalized.ends_with(" priority")
}

fn priority_text(value: &Value) -> String {
    match value {
        Value::Bool(false) => "no".to_string(),
        _ => property_text(value),
    }
}

fn yaml_value_to_property(key: &str, value: &Value) -> Result<NoteProperty, String> {
    if is_status_key(key) {
        return Ok(NoteProperty {
            key: key.to_string(),
            kind: "status".to_string(),
            value_text: Some(property_text(value)),
            value_bool: None,
            value_list: Vec::new(),
        });
    }
    if is_priority_key(key) {
        return Ok(NoteProperty {
            key: key.to_string(),
            kind: "priority".to_string(),
            value_text: Some(priority_text(value)),
            value_bool: None,
            value_list: Vec::new(),
        });
    }

    match value {
        Value::Bool(v) => Ok(NoteProperty {
            key: key.to_string(),
            kind: "checkbox".to_string(),
            value_text: None,
            value_bool: Some(*v),
            value_list: Vec::new(),
        }),
        Value::Sequence(items) if key.eq_ignore_ascii_case("tags") => {
            let Some(values) = items.iter().map(scalar_text).collect::<Option<Vec<_>>>() else {
                return Ok(NoteProperty {
                    key: key.to_string(),
                    kind: "text".to_string(),
                    value_text: Some(property_text(value)),
                    value_bool: None,
                    value_list: Vec::new(),
                });
            };
            Ok(NoteProperty {
                key: key.to_string(),
                kind: "tags".to_string(),
                value_text: None,
                value_bool: None,
                value_list: values,
            })
        }
        _ => {
            let text = property_text(value);
            let kind = infer_string_kind(&text);
            Ok(NoteProperty {
                key: key.to_string(),
                kind: kind.to_string(),
                value_text: Some(text),
                value_bool: None,
                value_list: Vec::new(),
            })
        }
    }
}

fn property_to_yaml_value(property: &NoteProperty) -> Result<Value, String> {
    match property.kind.as_str() {
        "checkbox" => Ok(Value::Bool(property.value_bool.unwrap_or(false))),
        "tags" => Ok(Value::Sequence(
            property
                .value_list
                .iter()
                .map(|value| Value::String(value.clone()))
                .collect(),
        )),
        _ => Ok(Value::String(
            property.value_text.clone().unwrap_or_default(),
        )),
    }
}

#[tauri::command]
pub fn note_frontmatter_parse_properties(
    frontmatter: Option<String>,
) -> Result<Vec<NoteProperty>, String> {
    let mapping = parse_frontmatter_mapping(raw_yaml(frontmatter.as_deref()))?;
    mapping
        .iter()
        .map(|(key, value)| {
            let key = key
                .as_str()
                .ok_or_else(|| "frontmatter keys must be strings".to_string())?;
            yaml_value_to_property(key, value)
        })
        .collect()
}

#[tauri::command]
pub fn note_frontmatter_render_properties(
    properties: Vec<NoteProperty>,
) -> Result<Option<String>, String> {
    let mut mapping = Mapping::new();
    let mut seen = HashSet::<String>::new();

    for property in properties {
        let key = property.key.trim().to_string();
        if key.is_empty() {
            continue;
        }
        let normalized = key.to_lowercase();
        if !seen.insert(normalized) {
            return Err(format!("duplicate property key '{}'", key));
        }
        mapping.insert(Value::String(key), property_to_yaml_value(&property)?);
    }

    if mapping.is_empty() {
        return Ok(None);
    }
    Ok(Some(format!(
        "---\n{}---\n",
        render_frontmatter_mapping_yaml(&mapping)?
    )))
}

#[cfg(test)]
mod tests {
    use super::note_frontmatter_parse_properties;

    #[test]
    fn infers_existing_yaml_properties_from_frontmatter() {
        let input = Some(
            r#"---
title: "Project Research Note"
source: "https://example.com/research-note"
author:
  - "[[Research Team]]"
published: 2026-02-23
created: 2026-02-25
description: "Reference material for planning"
tags:
  - "research"
---
"#
            .to_string(),
        );

        let properties = note_frontmatter_parse_properties(input).expect("should parse");

        let title = properties
            .iter()
            .find(|property| property.key == "title")
            .unwrap();
        assert_eq!(title.kind, "text");
        assert_eq!(title.value_text.as_deref(), Some("Project Research Note"));

        let source = properties
            .iter()
            .find(|property| property.key == "source")
            .unwrap();
        assert_eq!(source.kind, "url");

        let author = properties
            .iter()
            .find(|property| property.key == "author")
            .unwrap();
        assert_eq!(author.kind, "text");
        assert_eq!(author.value_text.as_deref(), Some("[[Research Team]]"));

        let published = properties
            .iter()
            .find(|property| property.key == "published")
            .unwrap();
        assert_eq!(published.kind, "date");

        let created = properties
            .iter()
            .find(|property| property.key == "created")
            .unwrap();
        assert_eq!(created.kind, "date");

        let tags = properties
            .iter()
            .find(|property| property.key == "tags")
            .unwrap();
        assert_eq!(tags.kind, "tags");
        assert_eq!(tags.value_list, vec!["research".to_string()]);
    }

    #[test]
    fn infers_status_properties_from_status_like_keys() {
        let input = Some(
            r#"---
status: In Progress
stage: blocked
Review Status: someday
---
"#
            .to_string(),
        );

        let properties = note_frontmatter_parse_properties(input).expect("should parse");
        assert_eq!(
            properties
                .iter()
                .find(|property| property.key == "status")
                .unwrap()
                .kind,
            "status"
        );
        assert_eq!(
            properties
                .iter()
                .find(|property| property.key == "stage")
                .unwrap()
                .kind,
            "text"
        );
        let custom_status = properties
            .iter()
            .find(|property| property.key == "Review Status")
            .unwrap();
        assert_eq!(custom_status.kind, "status");
        assert_eq!(custom_status.value_text.as_deref(), Some("someday"));
    }
}
