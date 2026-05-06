use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::State;

use crate::{paths, space::SpaceState, utils};

#[derive(Clone)]
struct FileEntry {
    rel_path: String,
    is_markdown: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct LinkSuggestionItem {
    pub path: String,
    pub title: String,
    pub insert_text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct LinkSuggestRequest {
    pub query: String,
    pub source_path: Option<String>,
    pub markdown_only: Option<bool>,
    pub include_pdf: Option<bool>,
    pub include_images: Option<bool>,
    pub strip_markdown_ext: Option<bool>,
    pub relative_to_source: Option<bool>,
    pub limit: Option<u32>,
}

fn normalize(input: &str) -> String {
    input.to_lowercase().trim().replace('\\', "/")
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/").trim_matches('/').to_string()
}

fn should_hide(name: &str) -> bool {
    name.starts_with('.') || name.eq_ignore_ascii_case("node_modules")
}

fn basename(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path).to_string()
}

fn basename_without_extension(path: &str) -> String {
    let name = basename(path);
    match name.rsplit_once('.') {
        Some((stem, _)) => stem.to_string(),
        None => name,
    }
}

fn title_from_rel(path: &str) -> String {
    basename(path)
        .trim_end_matches(".md")
        .trim_end_matches(".MD")
        .to_string()
}

fn normalize_segments(path: &str) -> String {
    let mut stack: Vec<&str> = Vec::new();
    for part in path.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            let _ = stack.pop();
            continue;
        }
        stack.push(part);
    }
    stack.join("/")
}

fn parent_dir(path: &str) -> String {
    let p = normalize_path(path);
    match p.rsplit_once('/') {
        Some((left, _)) => left.to_string(),
        None => String::new(),
    }
}

fn relative_path(from_dir: &str, to_path: &str) -> String {
    let from: Vec<&str> = from_dir.split('/').filter(|s| !s.is_empty()).collect();
    let to: Vec<&str> = to_path.split('/').filter(|s| !s.is_empty()).collect();
    let mut i = 0;
    while i < from.len() && i < to.len() && from[i] == to[i] {
        i += 1;
    }
    let mut out: Vec<String> = vec!["..".to_string(); from.len().saturating_sub(i)];
    out.extend(to[i..].iter().map(|s| s.to_string()));
    if out.is_empty() {
        ".".to_string()
    } else {
        out.join("/")
    }
}

fn list_files(root: &Path, markdown_only: bool, limit: usize) -> Result<Vec<FileEntry>, String> {
    let mut out: Vec<FileEntry> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![PathBuf::new()];
    while let Some(rel_dir) = stack.pop() {
        let abs = paths::join_under(root, &rel_dir)?;
        let entries = match std::fs::read_dir(abs) {
            Ok(v) => v,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if should_hide(&name) {
                continue;
            }
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let child_rel = rel_dir.join(&name);
            if meta.is_dir() {
                stack.push(child_rel);
                continue;
            }
            if !meta.is_file() {
                continue;
            }
            let rel = utils::to_slash(&child_rel);
            let md = utils::is_markdown_path(Path::new(&rel));
            if markdown_only && !md {
                continue;
            }
            out.push(FileEntry {
                rel_path: rel,
                is_markdown: md,
            });
            if out.len() >= limit {
                break;
            }
        }
        if out.len() >= limit {
            break;
        }
    }
    out.sort_by_cached_key(|e| e.rel_path.to_lowercase());
    Ok(out)
}

fn is_image_rel_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".webp")
        || lower.ends_with(".gif")
        || lower.ends_with(".svg")
        || lower.ends_with(".bmp")
        || lower.ends_with(".avif")
        || lower.ends_with(".tif")
        || lower.ends_with(".tiff")
}

fn is_pdf_rel_path(path: &str) -> bool {
    path.to_ascii_lowercase().ends_with(".pdf")
}

fn is_standard_wikilink_rel_path(entry: &FileEntry) -> bool {
    entry.is_markdown || is_pdf_rel_path(&entry.rel_path)
}

fn choose_ambiguous_image_match(matches: Vec<String>) -> Option<String> {
    if matches.is_empty() {
        return None;
    }
    if matches.len() == 1 {
        return matches.into_iter().next();
    }
    let mut root_only = matches
        .iter()
        .filter(|path| !path.contains('/'))
        .cloned()
        .collect::<Vec<_>>();
    if root_only.len() == 1 {
        return root_only.pop();
    }
    let mut sorted = matches;
    sorted.sort_by_cached_key(|path| path.to_lowercase());
    sorted.into_iter().next()
}

fn resolve_image_wikilink_target(entries: &[FileEntry], target: &str) -> Option<String> {
    let raw = target
        .split('#')
        .next()
        .unwrap_or("")
        .split('|')
        .next()
        .unwrap_or("")
        .trim()
        .replace('\\', "/");
    if raw.is_empty() {
        return None;
    }

    let pre_normalized = raw.trim_start_matches("./");
    let is_explicit_path = pre_normalized.starts_with('/') || pre_normalized.contains('/');
    let normalized = normalize_segments(pre_normalized);
    if normalized.is_empty() {
        return None;
    }

    let image_entries = entries
        .iter()
        .filter(|entry| is_image_rel_path(&entry.rel_path))
        .collect::<Vec<_>>();

    let explicit_path_query = if is_explicit_path {
        Some(normalized.trim_start_matches('/').to_string())
    } else {
        None
    };

    if let Some(path_query) = explicit_path_query {
        if let Some(hit) = image_entries
            .iter()
            .find(|entry| normalize_path(&entry.rel_path).eq_ignore_ascii_case(&path_query))
        {
            return Some(hit.rel_path.clone());
        }
        return None;
    }

    let file_name_query = normalized.trim_start_matches('/');
    let exact_name_matches = image_entries
        .iter()
        .filter(|entry| basename(&entry.rel_path).eq_ignore_ascii_case(file_name_query))
        .map(|entry| entry.rel_path.clone())
        .collect::<Vec<_>>();
    if !exact_name_matches.is_empty() {
        return choose_ambiguous_image_match(exact_name_matches);
    }

    let has_explicit_extension = file_name_query.rsplit_once('.').is_some();
    if has_explicit_extension {
        return None;
    }

    let stem_matches = image_entries
        .iter()
        .filter(|entry| {
            basename_without_extension(&entry.rel_path).eq_ignore_ascii_case(file_name_query)
        })
        .map(|entry| entry.rel_path.clone())
        .collect::<Vec<_>>();
    choose_ambiguous_image_match(stem_matches)
}

#[tauri::command]
pub async fn space_resolve_wikilink(
    state: State<'_, SpaceState>,
    target: String,
) -> Result<Option<String>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || {
        let entries = list_files(&root, false, 80_000)?;
        let norm = normalize_path(&target).trim_start_matches("./").to_string();
        let lowered = normalize(norm.trim_end_matches(".md"));
        if lowered.is_empty() {
            return Ok(None);
        }
        if let Some(hit) = entries
            .iter()
            .filter(|e| is_standard_wikilink_rel_path(e))
            .find(|e| normalize(e.rel_path.trim_end_matches(".md")) == lowered)
        {
            return Ok(Some(hit.rel_path.clone()));
        }
        if let Some(hit) = entries
            .iter()
            .filter(|e| is_standard_wikilink_rel_path(e))
            .find(|e| normalize(&title_from_rel(&e.rel_path)) == lowered)
        {
            return Ok(Some(hit.rel_path.clone()));
        }
        if let Some(hit) = entries.iter().find(|e| {
            is_standard_wikilink_rel_path(e)
                && normalize(e.rel_path.trim_end_matches(".md")).ends_with(&format!("/{lowered}"))
        }) {
            return Ok(Some(hit.rel_path.clone()));
        }
        Ok(None)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn space_resolve_image_wikilink(
    state: State<'_, SpaceState>,
    target: String,
) -> Result<Option<String>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || {
        let entries = list_files(&root, false, 80_000)?;
        Ok(resolve_image_wikilink_target(&entries, &target))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn space_resolve_markdown_link(
    state: State<'_, SpaceState>,
    href: String,
    source_path: String,
) -> Result<Option<String>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || {
        let entries = list_files(&root, false, 80_000)?;
        let raw = href
            .split('#')
            .next()
            .unwrap_or("")
            .trim()
            .replace('\\', "/");
        if raw.is_empty() || raw.starts_with("http://") || raw.starts_with("https://") {
            return Ok(None);
        }
        let source_dir = parent_dir(&source_path);
        let normalized_raw = raw.trim_start_matches("./");
        let mut candidates = Vec::<String>::new();
        if raw.starts_with('/') {
            candidates.push(normalize_segments(&raw));
        } else {
            candidates.push(normalize_segments(&format!(
                "{source_dir}/{normalized_raw}"
            )));
            candidates.push(normalize_segments(normalized_raw));
        }
        let mut expanded = candidates.clone();
        for c in &candidates {
            if !c.to_lowercase().ends_with(".md") {
                expanded.push(format!("{c}.md"));
            }
        }
        for c in expanded {
            if let Some(hit) = entries
                .iter()
                .find(|e| normalize_path(&e.rel_path).eq_ignore_ascii_case(&c))
            {
                return Ok(Some(hit.rel_path.clone()));
            }
        }
        Ok(None)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{resolve_image_wikilink_target, FileEntry};

    fn entry(path: &str) -> FileEntry {
        FileEntry {
            rel_path: path.to_string(),
            is_markdown: path.to_ascii_lowercase().ends_with(".md"),
        }
    }

    #[test]
    fn image_wikilink_resolves_root_relative_path() {
        let entries = vec![entry("images/cover.png"), entry("docs/note.md")];
        let resolved = resolve_image_wikilink_target(&entries, "/images/cover.png");
        assert_eq!(resolved, Some("images/cover.png".to_string()));
    }

    #[test]
    fn image_wikilink_resolves_nested_path_from_space_root() {
        let entries = vec![
            entry("assets/logo.png"),
            entry("docs/assets/logo.png"),
            entry("docs/note.md"),
        ];
        let resolved = resolve_image_wikilink_target(&entries, "assets/logo.png");
        assert_eq!(resolved, Some("assets/logo.png".to_string()));
    }

    #[test]
    fn image_wikilink_resolves_unique_filename() {
        let entries = vec![entry("images/hero.webp"), entry("docs/note.md")];
        let resolved = resolve_image_wikilink_target(&entries, "hero.webp");
        assert_eq!(resolved, Some("images/hero.webp".to_string()));
    }

    #[test]
    fn image_wikilink_resolves_extensionless_unique_stem() {
        let entries = vec![
            entry("images/diagram.png"),
            entry("images/other.jpg"),
            entry("docs/note.md"),
        ];
        let resolved = resolve_image_wikilink_target(&entries, "diagram");
        assert_eq!(resolved, Some("images/diagram.png".to_string()));
    }

    #[test]
    fn image_wikilink_ambiguous_filename_prefers_single_root_file() {
        let entries = vec![
            entry("photo.png"),
            entry("assets/photo.png"),
            entry("z/photo.png"),
            entry("docs/note.md"),
        ];
        let resolved = resolve_image_wikilink_target(&entries, "photo.png");
        assert_eq!(resolved, Some("photo.png".to_string()));
    }

    #[test]
    fn image_wikilink_ambiguous_filename_falls_back_to_lexicographic() {
        let entries = vec![
            entry("zeta/photo.png"),
            entry("alpha/photo.png"),
            entry("docs/note.md"),
        ];
        let resolved = resolve_image_wikilink_target(&entries, "photo.png");
        assert_eq!(resolved, Some("alpha/photo.png".to_string()));
    }

    #[test]
    fn image_wikilink_does_not_fallback_for_missing_explicit_nested_path() {
        let entries = vec![entry("images/photo.png"), entry("photo.png")];
        let resolved = resolve_image_wikilink_target(&entries, "assets/photo.png");
        assert_eq!(resolved, None);
    }

    #[test]
    fn image_wikilink_does_not_fallback_for_normalized_explicit_path() {
        let entries = vec![entry("images/photo.png"), entry("docs/note.md")];
        let resolved = resolve_image_wikilink_target(&entries, "assets/../photo.png");
        assert_eq!(resolved, None);
    }

    #[test]
    fn image_wikilink_ignores_non_images() {
        let entries = vec![entry("image.md"), entry("docs/note.md")];
        let resolved = resolve_image_wikilink_target(&entries, "image");
        assert_eq!(resolved, None);
    }
}

#[tauri::command]
pub async fn space_suggest_links(
    state: State<'_, SpaceState>,
    request: LinkSuggestRequest,
) -> Result<Vec<LinkSuggestionItem>, String> {
    let root = state.current_root()?;
    tauri::async_runtime::spawn_blocking(move || {
        let markdown_only = request.markdown_only.unwrap_or(false);
        let include_pdf = request.include_pdf.unwrap_or(false);
        let include_images = request.include_images.unwrap_or(false);
        let strip_md = request.strip_markdown_ext.unwrap_or(false);
        let relative = request.relative_to_source.unwrap_or(false);
        let limit = request.limit.unwrap_or(10).clamp(1, 200) as usize;
        let source_dir = request
            .source_path
            .as_deref()
            .map(parent_dir)
            .unwrap_or_default();
        let entries = list_files(
            &root,
            markdown_only && !include_pdf && !include_images,
            100_000,
        )?;
        let q = normalize(&request.query);

        let mut rows: Vec<(i32, LinkSuggestionItem)> = Vec::new();
        for entry in entries {
            if markdown_only
                && !entry.is_markdown
                && !(include_pdf && is_pdf_rel_path(&entry.rel_path))
                && !(include_images && is_image_rel_path(&entry.rel_path))
            {
                continue;
            }
            let title = title_from_rel(&entry.rel_path);
            let mut insert_text = if relative {
                relative_path(&source_dir, &entry.rel_path)
            } else {
                entry.rel_path.clone()
            };
            if strip_md && insert_text.to_lowercase().ends_with(".md") {
                let len = insert_text.len().saturating_sub(3);
                insert_text = insert_text[..len].to_string();
            }

            let score = if q.is_empty() {
                1
            } else {
                let title_n = normalize(&title);
                let path_n = normalize(&entry.rel_path);
                let insert_n = normalize(&insert_text);
                (if title_n.starts_with(&q) { 20 } else { 0 })
                    + (if insert_n.starts_with(&q) { 16 } else { 0 })
                    + (if path_n.starts_with(&q) { 12 } else { 0 })
                    + (if title_n.contains(&q) { 6 } else { 0 })
                    + (if insert_n.contains(&q) { 4 } else { 0 })
                    + (if path_n.contains(&q) { 2 } else { 0 })
            };
            if score <= 0 {
                continue;
            }
            rows.push((
                score,
                LinkSuggestionItem {
                    path: entry.rel_path,
                    title,
                    insert_text,
                },
            ));
        }

        rows.sort_by(|a, b| {
            b.0.cmp(&a.0)
                .then_with(|| a.1.path.to_lowercase().cmp(&b.1.path.to_lowercase()))
        });
        Ok(rows.into_iter().take(limit).map(|r| r.1).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}
