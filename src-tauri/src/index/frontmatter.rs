use serde::Deserialize;
use std::path::Path;

use super::helpers::now_sqlite_compatible_iso8601;

pub fn split_frontmatter(markdown: &str) -> (&str, &str) {
    if let Some(rest) = markdown.strip_prefix("---\n") {
        if let Some(idx) = rest.find("\n---\n") {
            let fm = &rest[..idx];
            let body = &rest[idx + "\n---\n".len()..];
            return (fm, body);
        }
        if let Some(idx) = rest.find("\n---\r\n") {
            let fm = &rest[..idx];
            let body = &rest[idx + "\n---\r\n".len()..];
            return (fm, body);
        }
    }
    if let Some(rest) = markdown.strip_prefix("---\r\n") {
        if let Some(idx) = rest.find("\r\n---\r\n") {
            let fm = &rest[..idx];
            let body = &rest[idx + "\r\n---\r\n".len()..];
            return (fm, body);
        }
        if let Some(idx) = rest.find("\r\n---\n") {
            let fm = &rest[..idx];
            let body = &rest[idx + "\r\n---\n".len()..];
            return (fm, body);
        }
    }
    ("", markdown)
}

#[derive(Default, Deserialize)]
struct Frontmatter {
    title: Option<String>,
    created: Option<String>,
    updated: Option<String>,
}

pub fn parse_frontmatter_title_created_updated(markdown: &str) -> (String, String, String) {
    let (yaml, _body) = split_frontmatter(markdown);
    if yaml.is_empty() {
        let now = now_sqlite_compatible_iso8601();
        return ("Untitled".to_string(), now.clone(), now);
    }
    let fm: Result<Frontmatter, _> = serde_yaml::from_str(yaml);
    let now = now_sqlite_compatible_iso8601();
    match fm {
        Ok(fm) => (
            fm.title.unwrap_or_else(|| "Untitled".to_string()),
            fm.created.unwrap_or_else(|| now.clone()),
            fm.updated.unwrap_or(now),
        ),
        Err(_) => ("Untitled".to_string(), now.clone(), now),
    }
}

pub fn preview_from_markdown(note_id: &str, markdown: &str) -> String {
    let (_yaml, body) = split_frontmatter(markdown);
    let body = body.trim();
    if body.is_empty() {
        return String::new();
    }

    let mut out = String::new();
    let mut has_more = false;
    for (count, line) in body.lines().enumerate() {
        if count >= 20 {
            has_more = true;
            break;
        }
        if count > 0 {
            out.push('\n');
        }
        out.push_str(line);
    }
    if has_more {
        out.push('\n');
        out.push('…');
    }

    if out.trim().is_empty() {
        let stem = Path::new(note_id)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        if !stem.is_empty() {
            return String::new();
        }
    }

    out
}
