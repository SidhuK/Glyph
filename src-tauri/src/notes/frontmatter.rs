use serde::{Deserialize, Serialize};
use serde_yaml::{Mapping, Value};

#[derive(Default, Deserialize, Serialize)]
pub struct Frontmatter {
    pub id: Option<String>,
    pub title: Option<String>,
    pub tags: Option<Vec<String>>,

    #[serde(flatten)]
    pub extra: std::collections::BTreeMap<String, serde_yaml::Value>,
}

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

pub fn parse_frontmatter(yaml: Option<&str>) -> Result<Frontmatter, String> {
    match yaml {
        None => Ok(Frontmatter::default()),
        Some(s) => {
            let v: Frontmatter = serde_yaml::from_str(s).map_err(|e| e.to_string())?;
            Ok(v)
        }
    }
}
