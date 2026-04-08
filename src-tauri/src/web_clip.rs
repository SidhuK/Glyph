use std::path::PathBuf;

use serde::Serialize;
use tauri::State;
use tracing::info;

use crate::io_atomic;
use crate::space::state::mark_recent_local_change;
use crate::{index, links, paths, space::SpaceState};

#[derive(Serialize)]
pub struct WebClipResult {
    pub rel_path: String,
    pub title: String,
}

fn escape_yaml_quoted_scalar(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace(['\n', '\r'], " ")
        .replace('"', "\\\"")
}

fn sanitize_filename(title: &str) -> String {
    let sanitized: String = title
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => c,
        })
        .collect();
    let trimmed = sanitized.trim().trim_matches('.').trim();
    if trimmed.is_empty() {
        "Clipped Page".to_string()
    } else {
        trimmed.to_string()
    }
}

fn clip_filename(title: &str, suffix: Option<usize>) -> String {
    let base = sanitize_filename(title);
    match suffix {
        Some(value) => format!("{base} {value}.md"),
        None => format!("{base}.md"),
    }
}

#[tauri::command]
pub async fn web_clip_save(
    state: State<'_, SpaceState>,
    url: String,
    folder: Option<String>,
) -> Result<WebClipResult, String> {
    let root = state.current_root()?;
    let recent_local_changes = state.recent_local_changes();

    tauri::async_runtime::spawn_blocking(move || -> Result<WebClipResult, String> {
        let normalized = links::helpers::normalize_url(&url)?;
        let client = links::helpers::http_client()?;
        let html = links::fetch::fetch_html(&client, &normalized)?;
        let title = links::fetch::extract_title(&html).unwrap_or_else(|| "Clipped Page".into());
        let converter = htmd::HtmlToMarkdown::builder()
            .skip_tags(vec![
                "script", "style", "noscript", "iframe", "object", "embed", "nav", "footer",
                "header", "form", "svg", "canvas",
            ])
            .build();
        let content = converter.convert(&html).unwrap_or_default();
        let safe_title = escape_yaml_quoted_scalar(&title);
        let safe_url = escape_yaml_quoted_scalar(&url);

        let frontmatter = format!(
            "---\ntitle: \"{}\"\nsource: \"{}\"\ntags:\n  - web-clip\n---\n\n",
            safe_title, safe_url,
        );
        let markdown = format!("{frontmatter}{content}");
        let folder_path = match &folder {
            Some(value) if !value.is_empty() => PathBuf::from(value),
            _ => PathBuf::new(),
        };

        for attempt in 0..10_000 {
            let filename = clip_filename(&title, (attempt > 0).then_some(attempt + 1));
            let rel = folder_path.join(&filename);
            let abs = paths::join_under(&root, &rel)?;
            let rel_path = rel.to_string_lossy().to_string();

            if abs.parent().is_none() {
                return Err("failed to resolve clip destination".to_string());
            }
            if abs.exists() {
                continue;
            }

            io_atomic::write_atomic(&abs, markdown.as_bytes()).map_err(|e| e.to_string())?;

            mark_recent_local_change(&recent_local_changes, &rel_path);
            if let Err(error) = index::index_note(&root, &rel_path, &markdown) {
                let _ = std::fs::remove_file(&abs);
                return Err(error);
            }

            info!(path = %rel_path, "web clip saved");

            return Ok(WebClipResult { rel_path, title });
        }

        Err("failed to allocate a unique filename for web clip".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{clip_filename, escape_yaml_quoted_scalar};
    use crate::notes::frontmatter::parse_frontmatter_mapping;

    #[test]
    fn clip_filename_uses_base_name_for_first_save() {
        assert_eq!(clip_filename("Hello / World", None), "Hello - World.md");
    }

    #[test]
    fn clip_filename_appends_numeric_suffix_for_collisions() {
        assert_eq!(
            clip_filename("Hello / World", Some(2)),
            "Hello - World 2.md"
        );
    }

    #[test]
    fn escape_yaml_quoted_scalar_flattens_newlines_and_escapes_quotes_and_backslashes() {
        assert_eq!(
            escape_yaml_quoted_scalar("line 1\r\n\"quoted\" \\ slash"),
            "line 1  \\\"quoted\\\" \\\\ slash"
        );
    }

    #[test]
    fn escaped_multiline_title_produces_valid_frontmatter() {
        let frontmatter = format!(
            "---\ntitle: \"{}\"\nsource: \"{}\"\ntags:\n  - web-clip\n---\n",
            escape_yaml_quoted_scalar("My Article\nsubtitle"),
            escape_yaml_quoted_scalar("https://example.com")
        );

        let parsed = parse_frontmatter_mapping(Some(
            "title: \"My Article subtitle\"\nsource: \"https://example.com\"\ntags:\n  - web-clip",
        ));
        assert!(parsed.is_ok());

        let raw = frontmatter
            .strip_prefix("---\n")
            .and_then(|value| value.strip_suffix("\n---\n"))
            .expect("frontmatter delimiters should exist");
        assert!(parse_frontmatter_mapping(Some(raw)).is_ok());
    }
}
