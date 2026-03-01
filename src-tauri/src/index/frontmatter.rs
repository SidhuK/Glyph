use serde::Deserialize;
use std::path::Path;

use super::helpers::now_sqlite_compatible_iso8601;

fn format_system_time(t: std::time::SystemTime) -> String {
    let dt = time::OffsetDateTime::from(t);
    dt.format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| now_sqlite_compatible_iso8601())
}

fn file_timestamps(path: &Path) -> (String, String) {
    let now = now_sqlite_compatible_iso8601();
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return (now.clone(), now),
    };
    let created = meta
        .created()
        .map(|t| format_system_time(t))
        .unwrap_or_else(|_| now.clone());
    let updated = meta
        .modified()
        .map(|t| format_system_time(t))
        .unwrap_or_else(|_| now.clone());
    (created, updated)
}

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

pub fn parse_frontmatter_title_created_updated(
    markdown: &str,
    file_path: &Path,
) -> (String, String, String) {
    let (yaml, _body) = split_frontmatter(markdown);
    let fs_fallback = || file_timestamps(file_path);

    if yaml.is_empty() {
        let (created, updated) = fs_fallback();
        return ("Untitled".to_string(), created, updated);
    }
    let fm: Result<Frontmatter, _> = serde_yaml::from_str(yaml);
    match fm {
        Ok(fm) => {
            let (fs_created, fs_updated) = fs_fallback();
            (
                fm.title.unwrap_or_else(|| "Untitled".to_string()),
                fm.created.unwrap_or(fs_created),
                fm.updated.unwrap_or(fs_updated),
            )
        }
        Err(_) => {
            let (created, updated) = fs_fallback();
            ("Untitled".to_string(), created, updated)
        }
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
