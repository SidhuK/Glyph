use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;

#[derive(Default, Deserialize, Serialize)]
pub struct Frontmatter {
    pub id: Option<String>,
    pub title: Option<String>,
    pub created: Option<String>,
    pub updated: Option<String>,
    pub tags: Option<Vec<String>>,

    #[serde(flatten)]
    pub extra: std::collections::BTreeMap<String, serde_yaml::Value>,
}

pub fn now_rfc3339() -> String {
    time::OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
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

pub fn render_frontmatter_yaml(fm: &Frontmatter) -> Result<String, String> {
    serde_yaml::to_string(fm).map_err(|e| e.to_string())
}

pub fn normalize_frontmatter(
    mut fm: Frontmatter,
    note_id: &str,
    default_title: Option<&str>,
    preserve_created: Option<&str>,
) -> Frontmatter {
    fm.id = Some(note_id.to_string());
    if fm.title.as_deref().unwrap_or("").is_empty() {
        fm.title = default_title
            .map(str::to_string)
            .or_else(|| Some("Untitled".to_string()));
    }

    if fm.created.as_deref().unwrap_or("").is_empty() {
        fm.created = preserve_created
            .map(str::to_string)
            .or_else(|| Some(now_rfc3339()));
    }

    fm.updated = Some(now_rfc3339());
    if fm.tags.is_none() {
        fm.tags = Some(Vec::new());
    }
    fm
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
