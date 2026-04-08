use std::path::PathBuf;

use serde::Serialize;
use tauri::State;
use tracing::info;

use crate::space::state::mark_recent_local_change;
use crate::{index, links, paths, space::SpaceState};

#[derive(Serialize)]
pub struct WebClipResult {
    pub rel_path: String,
    pub title: String,
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
                "script", "style", "noscript", "iframe", "object", "embed",
                "nav", "footer", "header", "form", "svg", "canvas",
            ])
            .build();
        let content = converter.convert(&html).unwrap_or_default();

        let frontmatter = format!(
            "---\ntitle: \"{}\"\nsource: \"{}\"\ntags:\n  - web-clip\n---\n\n",
            title.replace('"', "\\\""),
            url.replace('"', "\\\""),
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

            if let Some(parent) = abs.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                let mut file = match std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&abs)
                {
                    Ok(file) => file,
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                        continue;
                    }
                    Err(error) => return Err(error.to_string()),
                };
                use std::io::Write as _;
                file.write_all(markdown.as_bytes())
                    .and_then(|_| file.sync_all())
                    .map_err(|e| e.to_string())?;
                std::fs::File::open(parent)
                    .and_then(|dir| dir.sync_all())
                    .map_err(|e| e.to_string())?;
            } else {
                return Err("failed to resolve clip destination".to_string());
            }

            mark_recent_local_change(&recent_local_changes, &rel_path);
            index::index_note(&root, &rel_path, &markdown)?;

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
    use super::clip_filename;

    #[test]
    fn clip_filename_uses_base_name_for_first_save() {
        assert_eq!(clip_filename("Hello / World", None), "Hello - World.md");
    }

    #[test]
    fn clip_filename_appends_numeric_suffix_for_collisions() {
        assert_eq!(clip_filename("Hello / World", Some(2)), "Hello - World 2.md");
    }
}
