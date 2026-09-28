use serde_yaml::{Mapping, Value};

pub fn split_frontmatter(markdown: &str) -> (Option<&str>, &str) {
    if let Some(rest) = markdown.strip_prefix("---\n") {
        if let Some(idx) = rest.find("\n---\n") {
            let fm = &rest[..idx];
            let body = &rest[idx + "\n---\n".len()..];
            return (Some(fm), body);
        }
        if let Some(idx) = rest.find("\n---\r\n") {
            let fm = &rest[..idx];
            let body = &rest[idx + "\n---\r\n".len()..];
            return (Some(fm), body);
        }
        return (None, markdown);
    }

    if let Some(rest) = markdown.strip_prefix("---\r\n") {
        if let Some(idx) = rest.find("\r\n---\r\n") {
            let fm = &rest[..idx];
            let body = &rest[idx + "\r\n---\r\n".len()..];
            return (Some(fm), body);
        }
        if let Some(idx) = rest.find("\r\n---\n") {
            let fm = &rest[..idx];
            let body = &rest[idx + "\r\n---\n".len()..];
            return (Some(fm), body);
        }
        return (None, markdown);
    }

    (None, markdown)
}

fn key(name: &str) -> Value {
    Value::String(name.to_string())
}

fn get_string(mapping: &Mapping, field: &str) -> Option<String> {
    mapping.get(key(field)).and_then(|value| match value {
        Value::String(s) => Some(s.trim().to_string()).filter(|s| !s.is_empty()),
        Value::Null => None,
        other => serde_yaml::to_string(other)
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
    })
}

fn set_value(mapping: &mut Mapping, field: &str, value: Value) {
    mapping.insert(key(field), value);
}

pub fn parse_frontmatter_mapping(yaml: Option<&str>) -> Result<Mapping, String> {
    match yaml {
        None => Ok(Mapping::new()),
        Some(s) if s.trim().is_empty() => Ok(Mapping::new()),
        Some(s) => serde_yaml::from_str::<Mapping>(s).map_err(|e| e.to_string()),
    }
}

pub fn render_frontmatter_mapping_yaml(mapping: &Mapping) -> Result<String, String> {
    serde_yaml::to_string(mapping).map_err(|e| e.to_string())
}

pub fn normalize_frontmatter_mapping(
    mut mapping: Mapping,
    note_id: &str,
    default_title: Option<&str>,
) -> Mapping {
    set_value(&mut mapping, "id", Value::String(note_id.to_string()));

    if get_string(&mapping, "title").is_none() {
        set_value(
            &mut mapping,
            "title",
            Value::String(
                default_title
                    .map(str::to_string)
                    .unwrap_or_else(|| "Untitled".to_string()),
            ),
        );
    }

    mapping.remove(key("created"));
    mapping.remove(key("updated"));

    if !mapping.contains_key(key("tags")) {
        set_value(&mut mapping, "tags", Value::Sequence(Vec::new()));
    }

    mapping
}

/// Change only the archive field; never reserialize unrelated YAML or the note body.
pub fn set_archived(markdown: &str, archived: bool) -> Result<String, String> {
    let (yaml, _) = split_frontmatter(markdown);
    if yaml.is_none() && (markdown.starts_with("---\n") || markdown.starts_with("---\r\n")) {
        return Err("Note has an unclosed frontmatter block".into());
    }
    let mut expected = parse_frontmatter_mapping(yaml)?;
    let key = Value::String("archived".into());
    if let Some(value) = expected.get(&key) {
        if !value.is_bool() {
            return Err("The archived property must be a boolean".into());
        }
    }
    if expected.get(&key).and_then(Value::as_bool).unwrap_or(false) == archived {
        return Ok(markdown.to_string());
    }
    let existed = expected.contains_key(&key);
    if archived {
        expected.insert(key.clone(), Value::Bool(true));
    } else {
        expected.remove(&key);
    }
    let Some(yaml) = yaml else {
        return Ok(format!("---\narchived: true\n---\n{markdown}"));
    };
    let newline = if markdown.starts_with("---\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let mut next_yaml = None;
    if existed {
        let mut offset = 0;
        for line in yaml.split_inclusive('\n') {
            let content = line.trim_end_matches(['\r', '\n']);
            // A single top-level scalar can be edited without touching other properties.
            if !content.starts_with(char::is_whitespace) {
                if let Ok(field) = parse_frontmatter_mapping(Some(content)) {
                    if field.len() == 1 && field.get(&key).and_then(Value::as_bool).is_some() {
                        let comment = content
                            .find('#')
                            .map(|start| &content[start..])
                            .unwrap_or("");
                        let replacement = if archived {
                            if comment.is_empty() {
                                "archived: true".to_string()
                            } else {
                                format!("archived: true {comment}")
                            }
                        } else {
                            comment.to_string()
                        };
                        let mut candidate = yaml.to_string();
                        candidate.replace_range(offset..offset + content.len(), &replacement);
                        if expected.is_empty() {
                            candidate.push_str(&format!("{newline}{{}}"));
                        }
                        if parse_frontmatter_mapping(Some(&candidate)).ok().as_ref()
                            == Some(&expected)
                        {
                            next_yaml = Some(candidate);
                            break;
                        }
                    }
                }
            }
            offset += line.len();
        }
    } else {
        let candidate = if let Some(line) = yaml.lines().find(|line| line.trim() == "{}") {
            yaml.replacen(line, "archived: true", 1)
        } else {
            format!("archived: true{newline}{yaml}")
        };
        if parse_frontmatter_mapping(Some(&candidate)).ok().as_ref() == Some(&expected) {
            next_yaml = Some(candidate);
        }
    }
    let next_yaml = next_yaml.ok_or("Cannot safely edit the archived field in this YAML layout")?;
    let start = markdown.find('\n').ok_or("Missing frontmatter delimiter")? + 1;
    let mut next = markdown.to_string();
    // Keep the delimiters even when the mapping is empty, so body rules stay body text.
    next.replace_range(start..start + yaml.len(), &next_yaml);
    Ok(next)
}

#[cfg(test)]
mod archive_tests {
    use super::{set_archived, split_frontmatter};

    #[test]
    fn preserves_comments_scalars_and_body() {
        let note = "---\ntitle: 'A note' # title\n# keep this\ndescription: |\n  several lines\n  of text\n---\nBody\n";
        let archived = set_archived(note, true).unwrap();
        assert_eq!(archived, note.replacen("---\n", "---\narchived: true\n", 1));
        let restored = set_archived(&archived, false).unwrap();
        assert!(restored.contains(
            "title: 'A note' # title\n# keep this\ndescription: |\n  several lines\n  of text"
        ));
        assert_eq!(split_frontmatter(&restored).1, "Body\n");
    }

    #[test]
    fn retains_empty_frontmatter_before_body_rule() {
        let restored =
            set_archived("---\narchived: true # keep\n---\n---\nbody\n---\n", false).unwrap();
        assert!(restored.contains("# keep"));
        assert_eq!(split_frontmatter(&restored).1, "---\nbody\n---\n");
        assert!(set_archived(&restored, true).is_ok());
    }

    #[test]
    fn preserves_crlf_and_rejects_unsafe_rewrites() {
        let note = "---\r\ntitle: Test\r\narchived: false # keep\r\n---\r\nbody";
        assert_eq!(
            set_archived(note, true).unwrap(),
            note.replace("archived: false", "archived: true")
        );
        assert!(set_archived("---\n{title: Test, archived: true}\n---\nbody", false).is_err());
        assert!(set_archived("---\narchived: personal value\n---\nbody", true).is_err());
    }
}
