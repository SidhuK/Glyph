use serde::Deserialize;
use std::path::Path;

use crate::notes::frontmatter as notes_frontmatter;
use crate::utils::file_timestamp_strings;

pub fn split_frontmatter(markdown: &str) -> (&str, &str) {
    match notes_frontmatter::split_frontmatter(markdown) {
        (Some(yaml), body) => (yaml, body),
        (None, body) => ("", body),
    }
}

#[derive(Default, Deserialize)]
struct Frontmatter {
    title: Option<String>,
}

pub fn parse_frontmatter_title_created_updated(
    markdown: &str,
    file_path: &Path,
) -> (String, String, String) {
    let (yaml, _body) = split_frontmatter(markdown);
    let (created, updated) = file_timestamp_strings(file_path);
    if yaml.is_empty() {
        return ("Untitled".to_string(), created, updated);
    }
    let title = serde_yaml::from_str::<Frontmatter>(yaml)
        .ok()
        .and_then(|fm| fm.title)
        .unwrap_or_else(|| "Untitled".to_string());
    (title, created, updated)
}

pub fn preview_from_markdown(markdown: &str) -> String {
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

    out
}
