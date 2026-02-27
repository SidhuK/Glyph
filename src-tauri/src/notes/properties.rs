use std::collections::HashSet;

use serde_yaml::{Mapping, Number, Value};

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

fn infer_string_kind(value: &str) -> &'static str {
    let trimmed = value.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return "url";
    }
    if trimmed.len() == 10
        && trimmed.chars().enumerate().all(|(index, ch)| {
            if index == 4 || index == 7 {
                ch == '-'
            } else {
                ch.is_ascii_digit()
            }
        })
    {
        return "date";
    }
    if is_iso8601_datetime(trimmed) {
        return "datetime";
    }
    "text"
}

fn is_iso8601_datetime(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() < 20 {
        return false;
    }
    let is_digit = |index: usize| bytes.get(index).is_some_and(u8::is_ascii_digit);
    if !(is_digit(0)
        && is_digit(1)
        && is_digit(2)
        && is_digit(3)
        && bytes.get(4) == Some(&b'-')
        && is_digit(5)
        && is_digit(6)
        && bytes.get(7) == Some(&b'-')
        && is_digit(8)
        && is_digit(9)
        && bytes.get(10) == Some(&b'T')
        && is_digit(11)
        && is_digit(12)
        && bytes.get(13) == Some(&b':')
        && is_digit(14)
        && is_digit(15)
        && bytes.get(16) == Some(&b':')
        && is_digit(17)
        && is_digit(18))
    {
        return false;
    }

    let mut index = 19;
    if bytes.get(index) == Some(&b'.') {
        index += 1;
        let fraction_start = index;
        while bytes.get(index).is_some_and(u8::is_ascii_digit) {
            index += 1;
        }
        if index == fraction_start {
            return false;
        }
    }

    match bytes.get(index) {
        Some(b'Z') => index += 1,
        Some(b'+') | Some(b'-') => {
            index += 1;
            if !(is_digit(index)
                && is_digit(index + 1)
                && bytes.get(index + 2) == Some(&b':')
                && is_digit(index + 3)
                && is_digit(index + 4))
            {
                return false;
            }
            index += 5;
        }
        _ => return false,
    }

    index == bytes.len()
}

fn yaml_value_to_property(key: &str, value: &Value) -> Result<NoteProperty, String> {
    match value {
        Value::Bool(v) => Ok(NoteProperty {
            key: key.to_string(),
            kind: "checkbox".to_string(),
            value_text: None,
            value_bool: Some(*v),
            value_list: Vec::new(),
        }),
        Value::Number(n) => Ok(NoteProperty {
            key: key.to_string(),
            kind: "number".to_string(),
            value_text: Some(n.to_string()),
            value_bool: None,
            value_list: Vec::new(),
        }),
        Value::Sequence(items) => {
            let Some(values) = items.iter().map(scalar_text).collect::<Option<Vec<_>>>() else {
                return Ok(NoteProperty {
                    key: key.to_string(),
                    kind: "yaml".to_string(),
                    value_text: Some(serde_yaml::to_string(value).map_err(|e| e.to_string())?),
                    value_bool: None,
                    value_list: Vec::new(),
                });
            };
            Ok(NoteProperty {
                key: key.to_string(),
                kind: if key.eq_ignore_ascii_case("tags") {
                    "tags".to_string()
                } else {
                    "list".to_string()
                },
                value_text: None,
                value_bool: None,
                value_list: values,
            })
        }
        Value::Mapping(_) => Ok(NoteProperty {
            key: key.to_string(),
            kind: "yaml".to_string(),
            value_text: Some(serde_yaml::to_string(value).map_err(|e| e.to_string())?),
            value_bool: None,
            value_list: Vec::new(),
        }),
        _ => {
            let text = scalar_text(value).unwrap_or_default();
            Ok(NoteProperty {
                key: key.to_string(),
                kind: infer_string_kind(&text).to_string(),
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
        "number" => {
            let raw = property.value_text.clone().unwrap_or_default();
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return Ok(Value::Null);
            }
            if let Ok(int) = trimmed.parse::<i64>() {
                return Ok(Value::Number(Number::from(int)));
            }
            let float = trimmed
                .parse::<f64>()
                .map_err(|_| format!("invalid number for property '{}'", property.key))?;
            Ok(Value::Number(Number::from(float)))
        }
        "tags" | "list" => Ok(Value::Sequence(
            property
                .value_list
                .iter()
                .map(|value| Value::String(value.clone()))
                .collect(),
        )),
        "yaml" => {
            let raw = property.value_text.clone().unwrap_or_default();
            if raw.trim().is_empty() {
                return Ok(Value::Null);
            }
            serde_yaml::from_str::<Value>(&raw).map_err(|e| e.to_string())
        }
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
title: "The Flawed V02 Max Craze"
source: "https://erictopol.substack.com/p/the-flawed-v02-max-craze"
author:
  - "[[Eric Topol]]"
published: 2026-02-23
created: 2026-02-25
description: "Conflation With Cardiorespiratory Fitness"
tags:
  - "clippings"
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
        assert_eq!(
            title.value_text.as_deref(),
            Some("The Flawed V02 Max Craze")
        );

        let source = properties
            .iter()
            .find(|property| property.key == "source")
            .unwrap();
        assert_eq!(source.kind, "url");

        let author = properties
            .iter()
            .find(|property| property.key == "author")
            .unwrap();
        assert_eq!(author.kind, "list");
        assert_eq!(author.value_list, vec!["[[Eric Topol]]".to_string()]);

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
        assert_eq!(tags.value_list, vec!["clippings".to_string()]);
    }
}
