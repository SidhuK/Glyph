use std::collections::HashSet;

use serde_yaml::Value;

use crate::index::tags::normalize_tag;
use crate::notes::frontmatter::parse_frontmatter_mapping;

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

struct TagsBlock {
    start: usize,
    end: usize,
    /// Indent before `- ` when the value is a block sequence.
    item_indent: Option<String>,
}

/// The top-level `key:` line plus its indented or `- ` continuation lines.
fn find_block(yaml: &str, key: &str) -> Option<TagsBlock> {
    let mut offset = 0;
    let mut block: Option<TagsBlock> = None;
    let mut inline_value = false;
    for line in yaml.split_inclusive('\n') {
        let content = line.trim_end_matches(['\r', '\n']);
        let trimmed = content.trim_start();
        match &mut block {
            None => {
                if let Some(value) = content
                    .strip_prefix(key)
                    .and_then(|rest| rest.trim_start().strip_prefix(':'))
                {
                    let value = value.trim();
                    inline_value = !value.is_empty() && !value.starts_with('#');
                    block = Some(TagsBlock {
                        start: offset,
                        end: offset + line.len(),
                        item_indent: None,
                    });
                }
            }
            Some(found) => {
                if trimmed.is_empty() {
                    // Blank lines only belong to the block when more members follow.
                } else if content.starts_with(char::is_whitespace)
                    || content == "-"
                    || content.starts_with("- ")
                {
                    found.end = offset + line.len();
                    if !inline_value
                        && found.item_indent.is_none()
                        && (trimmed == "-" || trimmed.starts_with("- "))
                    {
                        found.item_indent = Some(content[..content.len() - trimmed.len()].into());
                    }
                } else {
                    break;
                }
            }
        }
        offset += line.len();
    }
    block
}

fn render_scalar(value: &Value, flow: bool) -> Result<String, SkipReason> {
    let rendered = serde_yaml::to_string(value).map_err(|_| UNSAFE)?;
    let rendered = rendered.trim_end_matches('\n');
    if rendered.contains('\n') {
        return Err(UNSAFE);
    }
    if flow && !rendered.starts_with(['\'', '"']) && rendered.contains([',', '[', ']', '{', '}']) {
        return serde_json::to_string(value).map_err(|_| UNSAFE);
    }
    Ok(rendered.to_string())
}

fn render_block(
    key: &str,
    value: &Value,
    item_indent: Option<&str>,
    newline: &str,
) -> Result<String, SkipReason> {
    let Value::Sequence(items) = value else {
        return Ok(format!("{key}: {}", render_scalar(value, false)?));
    };
    match item_indent {
        Some(indent) => {
            let mut out = format!("{key}:");
            for item in items {
                out.push_str(&format!(
                    "{newline}{indent}- {}",
                    render_scalar(item, false)?
                ));
            }
            Ok(out)
        }
        None => {
            let rendered = items
                .iter()
                .map(|item| render_scalar(item, true))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("{key}: [{}]", rendered.join(", ")))
        }
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
    let Some((key, key_text, value)) = mapping.iter().find_map(|(key, value)| {
        key.as_str()
            .filter(|text| text.eq_ignore_ascii_case("tags"))
            .map(|text| (key, text, value))
    }) else {
        return Ok(None);
    };
    let mut count = 0;
    let next = rewrite_value(value, refactor, &mut count)
        .filter(|value| !matches!(value, Value::Sequence(items) if items.is_empty()));
    if count == 0 {
        return Ok(None);
    }
    let mut expected = mapping.clone();
    match &next {
        Some(value) => {
            expected.insert(key.clone(), value.clone());
        }
        None => {
            expected.remove(key);
        }
    }

    let block = find_block(yaml, key_text).ok_or(UNSAFE)?;
    let newline = if yaml.contains("\r\n") { "\r\n" } else { "\n" };
    let ends_with_newline = yaml[..block.end].ends_with('\n');
    let mut candidate = yaml[..block.start].to_string();
    match &next {
        Some(value) => {
            candidate.push_str(&render_block(
                key_text,
                value,
                block.item_indent.as_deref(),
                newline,
            )?);
            if ends_with_newline {
                candidate.push_str(newline);
            }
        }
        None if !ends_with_newline => {
            // The removed block was the last line; drop the line break before it.
            if candidate.ends_with('\n') {
                candidate.pop();
            }
            if candidate.ends_with('\r') {
                candidate.pop();
            }
        }
        None => {}
    }
    candidate.push_str(&yaml[block.end..]);
    if parse_frontmatter_mapping(Some(&candidate)).ok().as_ref() != Some(&expected) {
        return Err(UNSAFE);
    }
    Ok(Some((candidate, count)))
}
