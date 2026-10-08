use std::collections::HashSet;

use serde_yaml::Value;

use crate::index::tags::normalize_tag;
use crate::notes::frontmatter::{parse_frontmatter_mapping, set_yaml_key};

use super::{SkipReason, TagRefactor};

const UNSAFE: SkipReason = SkipReason::UnsafeFrontmatter;

/// Mirrors `collect_tags_from_string`: comma-separated when a comma is present, else whitespace.
fn rewrite_string(raw: &str, refactor: &TagRefactor, count: &mut usize) -> Option<String> {
    let comma = raw.contains(',');
    let parts: Vec<&str> = if comma {
        raw.split(',').map(str::trim).collect()
    } else {
        raw.split_whitespace().collect()
    };
    let before = *count;
    let mut seen = HashSet::new();
    let mut next = Vec::new();
    for part in parts.into_iter().filter(|part| !part.is_empty()) {
        let (hash, bare) = part
            .strip_prefix('#')
            .map_or(("", part), |rest| ("#", rest));
        let written = match refactor.map(bare) {
            None => part.to_string(),
            Some(mapped) => {
                *count += 1;
                match mapped {
                    Some(target) => format!("{hash}{target}"),
                    None => continue,
                }
            }
        };
        if normalize_tag(&written).is_some_and(|tag| !seen.insert(tag)) {
            continue;
        }
        next.push(written);
    }
    if *count == before {
        return Some(raw.to_string());
    }
    (!next.is_empty()).then(|| next.join(if comma { ", " } else { " " }))
}

fn single_tag(value: &Value) -> Option<String> {
    match value {
        Value::String(raw) => normalize_tag(raw),
        Value::Number(number) => normalize_tag(&number.to_string()),
        _ => None,
    }
}

/// Mirrors `collect_tags_from_yaml_value`; `None` means the value is removed.
fn rewrite_value(value: &Value, refactor: &TagRefactor, count: &mut usize) -> Option<Value> {
    match value {
        Value::String(raw) => rewrite_string(raw, refactor, count).map(Value::String),
        Value::Number(number) => match refactor.map(&number.to_string()) {
            None => Some(value.clone()),
            Some(mapped) => {
                *count += 1;
                mapped.map(Value::String)
            }
        },
        Value::Sequence(items) => {
            let mut seen = HashSet::new();
            let mut next = Vec::new();
            for item in items {
                let Some(item) = rewrite_value(item, refactor, count) else {
                    continue;
                };
                if single_tag(&item).is_some_and(|tag| !seen.insert(tag)) {
                    continue;
                }
                next.push(item);
            }
            Some(Value::Sequence(next))
        }
        other => Some(other.clone()),
    }
}

/// Rewrites only the `tags` property, returning the new YAML and the number of
/// rewritten tags, or `None` when the property holds no affected tag.
pub(super) fn rewrite_frontmatter_tags(
    yaml: &str,
    refactor: &TagRefactor,
) -> Result<Option<(String, usize)>, SkipReason> {
    // Unparseable YAML contributes no tags to the index, so there is nothing to rewrite.
    let Ok(mapping) = parse_frontmatter_mapping(Some(yaml)) else {
        return Ok(None);
    };
    let Some((key_text, value)) = mapping.iter().find_map(|(key, value)| {
        key.as_str()
            .filter(|text| text.eq_ignore_ascii_case("tags"))
            .map(|text| (text, value))
    }) else {
        return Ok(None);
    };
    let mut count = 0;
    let next = rewrite_value(value, refactor, &mut count)
        .filter(|value| !matches!(value, Value::Sequence(items) if items.is_empty()));
    if count == 0 {
        return Ok(None);
    }
    let newline = if yaml.contains("\r\n") { "\r\n" } else { "\n" };
    let next_yaml = set_yaml_key(yaml, key_text, next.as_ref(), newline).map_err(|_| UNSAFE)?;
    Ok(Some((next_yaml, count)))
}
