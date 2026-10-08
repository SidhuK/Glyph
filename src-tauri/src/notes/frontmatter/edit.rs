use serde_yaml::Value;

use super::{parse_frontmatter_mapping, split_frontmatter};

fn line_ending(text: &str) -> &'static str {
    match text.split_once('\n') {
        Some((line, _)) if line.ends_with('\r') => "\r\n",
        _ => "\n",
    }
}

struct KeyBlock {
    start: usize,
    end: usize,
    /// The key as written in the file, including any quotes.
    key_text: String,
    comment: Option<String>,
    /// Indent before `- ` when the value is a block sequence.
    item_indent: Option<String>,
}

/// Splits a top-level `key: value` line when its key is `target`.
fn split_key<'a>(content: &'a str, target: &Value) -> Option<(&'a str, &'a str)> {
    if content.starts_with(char::is_whitespace) || content.starts_with(['#', '-']) {
        return None;
    }
    content.match_indices(':').find_map(|(index, _)| {
        let parsed = parse_frontmatter_mapping(Some(&content[..=index])).ok()?;
        (parsed.len() == 1 && parsed.contains_key(target))
            .then(|| (&content[..index], &content[index + 1..]))
    })
}

/// The `# comment` ending a line, found where cutting it leaves the parsed line unchanged.
fn trailing_comment(content: &str) -> Option<String> {
    let full = parse_frontmatter_mapping(Some(content)).ok()?;
    content.match_indices(" #").find_map(|(index, _)| {
        (parse_frontmatter_mapping(Some(&content[..index])).ok()? == full)
            .then(|| content[index + 1..].to_string())
    })
}

/// The top-level `key:` line plus its indented or `- ` continuation lines.
fn find_block(yaml: &str, target: &Value) -> Option<KeyBlock> {
    let mut offset = 0;
    let mut block: Option<KeyBlock> = None;
    let mut inline_value = false;
    for line in yaml.split_inclusive('\n') {
        let content = line.trim_end_matches(['\r', '\n']);
        let trimmed = content.trim_start();
        match &mut block {
            None => {
                if let Some((key_text, rest)) = split_key(content, target) {
                    let value = rest.trim();
                    inline_value = !value.is_empty() && !value.starts_with('#');
                    block = Some(KeyBlock {
                        start: offset,
                        end: offset + line.len(),
                        key_text: key_text.to_string(),
                        comment: trailing_comment(content),
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

fn render_item(value: &Value, flow: bool) -> Result<String, String> {
    let rendered = serde_yaml::to_string(value).map_err(|e| e.to_string())?;
    let rendered = rendered.trim_end_matches('\n');
    if rendered.contains('\n') {
        return Err("list items must fit on one line".to_string());
    }
    if flow && !rendered.starts_with(['\'', '"']) && rendered.contains([',', '[', ']', '{', '}']) {
        return serde_json::to_string(value).map_err(|e| e.to_string());
    }
    Ok(rendered.to_string())
}

fn render_entry(
    key_text: &str,
    value: &Value,
    item_indent: Option<&str>,
    comment: Option<&str>,
    newline: &str,
) -> Result<String, String> {
    let comment = comment
        .map(|comment| format!(" {comment}"))
        .unwrap_or_default();
    match (value, item_indent) {
        (Value::Sequence(items), _) if items.is_empty() => Ok(format!("{key_text}: []{comment}")),
        (Value::Sequence(items), Some(indent)) => {
            let mut out = format!("{key_text}:{comment}");
            for item in items {
                out.push_str(&format!("{newline}{indent}- {}", render_item(item, false)?));
            }
            Ok(out)
        }
        (Value::Sequence(items), None) => {
            let rendered = items
                .iter()
                .map(|item| render_item(item, true))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("{key_text}: [{}]{comment}", rendered.join(", ")))
        }
        _ => {
            let rendered = serde_yaml::to_string(value).map_err(|e| e.to_string())?;
            let rendered = rendered.trim_end_matches('\n');
            Ok(match rendered.split_once('\n') {
                None => format!("{key_text}: {rendered}{comment}"),
                Some((first, rest)) => {
                    format!(
                        "{key_text}: {first}{comment}{newline}{}",
                        rest.replace('\n', newline)
                    )
                }
            })
        }
    }
}

/// Sets (`Some`) or removes (`None`) one top-level key in raw frontmatter YAML.
/// Every other byte stays as written; layouts that cannot be edited safely are rejected.
pub fn set_yaml_key(
    yaml: &str,
    key: &str,
    value: Option<&Value>,
    newline: &str,
) -> Result<String, String> {
    let mapping = parse_frontmatter_mapping(Some(yaml))?;
    let target = Value::String(key.to_string());
    let mut expected = mapping.clone();
    match value {
        Some(value) => {
            expected.insert(target.clone(), value.clone());
        }
        None => {
            expected.remove(&target);
        }
    }
    if expected == mapping {
        return Ok(yaml.to_string());
    }
    let unsafe_edit = || format!("Cannot safely edit the '{key}' property in this frontmatter");
    let candidates = match find_block(yaml, &target) {
        Some(block) => {
            let ends_with_newline = yaml[..block.end].ends_with('\n');
            let mut candidate = yaml[..block.start].to_string();
            let replacement = match value {
                Some(value) => Some(render_entry(
                    &block.key_text,
                    value,
                    block.item_indent.as_deref(),
                    block.comment.as_deref(),
                    newline,
                )?),
                None => block.comment,
            };
            match replacement {
                Some(text) => {
                    candidate.push_str(&text);
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
            vec![candidate]
        }
        None if mapping.contains_key(&target) => return Err(unsafe_edit()),
        None => {
            let Some(value) = value else {
                return Ok(yaml.to_string());
            };
            let key_text = serde_yaml::to_string(&target).map_err(|e| e.to_string())?;
            let entry = render_entry(key_text.trim_end(), value, Some(""), None, newline)?;
            let placeholder = yaml.lines().find(|line| line.trim() == "{}");
            if let Some(line) = placeholder.filter(|_| mapping.is_empty()) {
                vec![yaml.replacen(line, &entry, 1)]
            } else if yaml.trim().is_empty() {
                vec![entry]
            } else {
                // Appending can change a trailing block scalar's final line break; prepend then.
                vec![
                    format!("{yaml}{newline}{entry}"),
                    format!("{entry}{newline}{yaml}"),
                ]
            }
        }
    };
    candidates
        .into_iter()
        .map(|mut candidate| {
            // A mapping with only comments left would no longer parse as a mapping.
            if expected.is_empty() && !candidate.trim().is_empty() {
                candidate.push_str(newline);
                candidate.push_str("{}");
            }
            candidate
        })
        .find(|candidate| {
            parse_frontmatter_mapping(Some(candidate)).ok().as_ref() == Some(&expected)
        })
        .ok_or_else(unsafe_edit)
}

/// Sets or removes one top-level frontmatter key while keeping the rest of the note byte-for-byte.
pub fn set_frontmatter_key(
    markdown: &str,
    key: &str,
    value: Option<&Value>,
) -> Result<String, String> {
    let newline = line_ending(markdown);
    let (yaml, _) = split_frontmatter(markdown);
    let Some(yaml) = yaml else {
        if value.is_none() {
            return Ok(markdown.to_string());
        }
        let next_yaml = set_yaml_key("", key, value, newline)?;
        return Ok(format!(
            "---{newline}{next_yaml}{newline}---{newline}{markdown}"
        ));
    };
    let next_yaml = set_yaml_key(yaml, key, value, newline)?;
    if next_yaml == yaml {
        return Ok(markdown.to_string());
    }
    // `split_frontmatter` only matches YAML that starts right after the first line.
    let start = markdown.find('\n').ok_or("Missing frontmatter delimiter")? + 1;
    let mut next = markdown.to_string();
    next.replace_range(start..start + yaml.len(), &next_yaml);
    Ok(next)
}

#[cfg(test)]
mod tests {
    use serde_yaml::Value;

    use super::set_frontmatter_key;

    fn list(items: &[&str]) -> Value {
        Value::Sequence(
            items
                .iter()
                .map(|item| Value::String(item.to_string()))
                .collect(),
        )
    }

    #[test]
    fn replaces_only_the_edited_property() {
        let note = "---\n# heading comment\ntitle: \"Plan\"\ncreated: 2024-01-01\nstatus: todo # lane\ntags:\n  - a\n  - b\n---\n\n\nBody\n";
        let next = set_frontmatter_key(note, "status", Some(&Value::String("done".into())));
        assert_eq!(next.unwrap(), note.replace("status: todo", "status: done"));
        let next = set_frontmatter_key(note, "tags", Some(&list(&["a", "c"])));
        assert_eq!(next.unwrap(), note.replace("  - b", "  - c"));
    }

    #[test]
    fn keeps_list_style_and_line_endings() {
        let note = "---\r\ntitle: A\r\nstage: [todo, 'x, y']\r\n---\r\nBody\r\n";
        let next = set_frontmatter_key(note, "stage", Some(&list(&["done", "x, y"]))).unwrap();
        assert_eq!(next, note.replace("[todo, 'x, y']", "[done, \"x, y\"]"));
        let next = set_frontmatter_key(note, "owner", Some(&list(&["me"]))).unwrap();
        assert_eq!(
            next,
            note.replace("x, y']\r\n", "x, y']\r\nowner:\r\n- me\r\n")
        );
    }

    #[test]
    fn adds_frontmatter_and_handles_multiline_values() {
        let next = set_frontmatter_key("Body\n", "status", Some(&Value::String("todo".into())));
        assert_eq!(next.unwrap(), "---\nstatus: todo\n---\nBody\n");
        let note = "---\nsummary: |\n  one\n  two\nstatus: todo\n---\nBody";
        let next = set_frontmatter_key(note, "summary", Some(&Value::String("short".into())));
        assert_eq!(
            next.unwrap(),
            "---\nsummary: short\nstatus: todo\n---\nBody"
        );
        let next = set_frontmatter_key(note, "summary", Some(&Value::String("a\nb".into())));
        assert_eq!(
            next.unwrap(),
            "---\nsummary: |-\n  a\n  b\nstatus: todo\n---\nBody"
        );
    }

    #[test]
    fn rejects_layouts_it_cannot_edit_in_place() {
        let flow = "---\n{title: A, status: todo}\n---\nBody";
        assert!(set_frontmatter_key(flow, "status", Some(&Value::String("done".into()))).is_err());
        let anchored = "---\nstatus: &s todo\nnext: *s\n---\nBody";
        assert!(set_frontmatter_key(anchored, "status", Some(&Value::String("x".into()))).is_err());
    }
}
