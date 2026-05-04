use std::path::{Component, Path};

use serde::Serialize;

use crate::{index, paths, utils};

#[derive(Debug, Clone)]
pub struct LinkRewritePlan {
    pub from_rel_path: String,
    pub to_rel_path: String,
    pub from_title: String,
    pub to_title: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct LinkRewriteResult {
    pub changed_files: Vec<String>,
    pub changed_links: usize,
}

pub fn rewrite_links_after_rename(
    space_root: &Path,
    plan: &LinkRewritePlan,
) -> Result<LinkRewriteResult, String> {
    let markdown_files = collect_markdown_files(space_root)?;
    let mut rewrites = Vec::new();

    for rel_path in markdown_files {
        let abs = paths::join_under(space_root, Path::new(&rel_path))?;
        let original = std::fs::read_to_string(&abs).map_err(|e| e.to_string())?;
        let rewrite = rewrite_markdown_links_for_path(&original, plan, &rel_path);

        if rewrite.markdown != original {
            rewrites.push((rel_path, abs, rewrite.markdown, rewrite.changed_links));
        }
    }

    let mut result = LinkRewriteResult::default();
    for (rel_path, abs, markdown, changed_links) in rewrites {
        match crate::io_atomic::write_atomic(&abs, markdown.as_bytes()) {
            Ok(()) => {
                result.changed_files.push(rel_path);
                result.changed_links += changed_links;
            }
            Err(error) => {
                tracing::warn!(
                    note_id = %rel_path,
                    error = %error,
                    "failed to write rewritten links after rename"
                );
            }
        }
    }

    Ok(result)
}

fn old_source_rel_path_for(source_rel_path: &str, plan: &LinkRewritePlan) -> Option<String> {
    if plan.is_dir {
        let to_prefix = format!("{}/", plan.to_rel_path.trim_end_matches('/'));
        if let Some(rest) = source_rel_path.strip_prefix(&to_prefix) {
            return Some(format!(
                "{}/{rest}",
                plan.from_rel_path.trim_end_matches('/')
            ));
        }
        return None;
    }

    (source_rel_path == plan.to_rel_path).then(|| plan.from_rel_path.clone())
}

pub fn rewrite_markdown_links_for_path(
    markdown: &str,
    plan: &LinkRewritePlan,
    source_rel_path: &str,
) -> RewriteMarkdownResult {
    let mut out = String::with_capacity(markdown.len());
    let mut changed_links = 0;
    let mut in_fence = false;

    for segment in markdown.split_inclusive('\n') {
        let line = segment.strip_suffix('\n').unwrap_or(segment);
        let newline = if segment.ends_with('\n') { "\n" } else { "" };
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            out.push_str(segment);
            continue;
        }
        if in_fence {
            out.push_str(segment);
            continue;
        }

        let wiki = rewrite_wikilinks(line, plan);
        let markdown_links = rewrite_markdown_link_targets(&wiki.markdown, plan, source_rel_path);
        changed_links += wiki.changed_links + markdown_links.changed_links;
        out.push_str(&markdown_links.markdown);
        out.push_str(newline);
    }

    RewriteMarkdownResult {
        markdown: out,
        changed_links,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RewriteMarkdownResult {
    pub markdown: String,
    pub changed_links: usize,
}

fn rewrite_wikilinks(markdown: &str, plan: &LinkRewritePlan) -> RewriteMarkdownResult {
    let mut out = String::with_capacity(markdown.len());
    let mut changed_links = 0;
    let mut i = 0;
    while let Some(start_rel) = markdown[i..].find("[[") {
        let start = i + start_rel;
        out.push_str(&markdown[i..start]);
        let inner_start = start + 2;
        let Some(end_rel) = markdown[inner_start..].find("]]") else {
            out.push_str(&markdown[start..]);
            return RewriteMarkdownResult {
                markdown: out,
                changed_links,
            };
        };
        let end = inner_start + end_rel;
        let inner = &markdown[inner_start..end];
        if let Some(next_inner) = rewrite_wikilink_inner(inner, plan) {
            out.push_str("[[");
            out.push_str(&next_inner);
            out.push_str("]]");
            changed_links += 1;
        } else {
            out.push_str(&markdown[start..end + 2]);
        }
        i = end + 2;
    }
    out.push_str(&markdown[i..]);
    RewriteMarkdownResult {
        markdown: out,
        changed_links,
    }
}

fn rewrite_markdown_link_targets(
    markdown: &str,
    plan: &LinkRewritePlan,
    source_rel_path: &str,
) -> RewriteMarkdownResult {
    let mut out = String::with_capacity(markdown.len());
    let mut changed_links = 0;
    let mut i = 0;
    while let Some(start_rel) = markdown[i..].find("](") {
        let start = i + start_rel + 2;
        let Some(close_rel) = markdown[start..].find(')') else {
            break;
        };
        let close = start + close_rel;
        out.push_str(&markdown[i..start]);
        let target = &markdown[start..close];
        if let Some(next_target) = rewrite_markdown_target(target, plan, source_rel_path) {
            out.push_str(&next_target);
            changed_links += 1;
        } else {
            out.push_str(target);
        }
        i = close;
    }
    out.push_str(&markdown[i..]);
    RewriteMarkdownResult {
        markdown: out,
        changed_links,
    }
}

fn rewrite_wikilink_inner(inner: &str, plan: &LinkRewritePlan) -> Option<String> {
    let (target_part, alias_part) = split_once_preserve(inner, '|');
    let (target_base, heading_part) = split_once_preserve(target_part, '#');
    let target = target_base.trim();
    let replacement = rewrite_target(target, plan, false)?;
    Some(format!("{replacement}{heading_part}{alias_part}"))
}

fn rewrite_markdown_target(
    target: &str,
    plan: &LinkRewritePlan,
    source_rel_path: &str,
) -> Option<String> {
    let trimmed = target.trim();
    let bare = trimmed.trim_matches('<').trim_matches('>');
    if is_external_target(bare) {
        return None;
    }

    let (without_fragment, fragment) = split_once_preserve(bare, '#');
    let raw_target = without_fragment.trim();
    let replacement = rewrite_markdown_target_path(raw_target, plan, source_rel_path)?;
    let wrapped = if trimmed.starts_with('<') && trimmed.ends_with('>') {
        format!("<{replacement}{fragment}>")
    } else {
        format!("{replacement}{fragment}")
    };
    Some(target.replacen(trimmed, &wrapped, 1))
}

fn rewrite_target(target: &str, plan: &LinkRewritePlan, markdown_link: bool) -> Option<String> {
    if target.is_empty() {
        return None;
    }

    let normalized_target = normalize_rel_path(target);
    let path_target = normalized_target.as_str();

    if plan.is_dir {
        return rewrite_prefix_target(path_target, &plan.from_rel_path, &plan.to_rel_path);
    }

    let from_no_ext = strip_md_extension(&plan.from_rel_path);
    let to_no_ext = strip_md_extension(&plan.to_rel_path);

    if path_target == plan.from_rel_path {
        return Some(plan.to_rel_path.clone());
    }
    if path_target == from_no_ext {
        return Some(to_no_ext);
    }
    if !markdown_link && target == plan.from_title {
        return Some(plan.to_title.clone());
    }
    None
}

fn rewrite_markdown_target_path(
    target: &str,
    plan: &LinkRewritePlan,
    source_rel_path: &str,
) -> Option<String> {
    if target.is_empty() {
        return None;
    }

    if target.starts_with('/') {
        let root_target = target.trim_start_matches('/');
        return rewrite_target(root_target, plan, true)
            .map(|replacement| format!("/{replacement}"));
    }

    if let Some(replacement) = rewrite_target(target, plan, true) {
        return Some(replacement);
    }

    let current_source_dir = source_dir(source_rel_path);
    let old_source_rel_path = old_source_rel_path_for(source_rel_path, plan);
    let resolution_source_dir = old_source_rel_path
        .as_deref()
        .map(source_dir)
        .unwrap_or_else(|| current_source_dir.clone());
    let root_target = join_rel_path(&resolution_source_dir, target);

    if let Some(replacement) = rewrite_target(&root_target, plan, true) {
        let relative = relative_path_from_source_dir(&replacement, &current_source_dir);
        return (relative != target).then_some(relative);
    }

    if old_source_rel_path.is_some() {
        let relocated = relative_path_from_source_dir(&root_target, &current_source_dir);
        if relocated != target {
            return Some(relocated);
        }
    }

    None
}

fn join_rel_path(base: &str, target: &str) -> String {
    if base.is_empty() {
        normalize_rel_path(target)
    } else {
        normalize_rel_path(&format!("{base}/{target}"))
    }
}

fn rewrite_prefix_target(target: &str, from_prefix: &str, to_prefix: &str) -> Option<String> {
    if target == from_prefix {
        return Some(to_prefix.to_string());
    }
    if let Some(rest) = target.strip_prefix(&format!("{from_prefix}/")) {
        return Some(format!("{to_prefix}/{rest}"));
    }
    None
}

fn source_dir(source_rel_path: &str) -> String {
    let parent = Path::new(source_rel_path)
        .parent()
        .and_then(|path| path.to_str())
        .unwrap_or("");
    normalize_rel_path(parent)
}

fn relative_path_from_source_dir(target: &str, source_dir: &str) -> String {
    let target = normalize_rel_path(target);
    let source_dir = normalize_rel_path(source_dir);
    if source_dir.is_empty() {
        return target;
    }

    let target_parts = split_rel_parts(&target);
    let source_parts = split_rel_parts(&source_dir);
    let mut common = 0;
    while common < target_parts.len()
        && common < source_parts.len()
        && target_parts[common] == source_parts[common]
    {
        common += 1;
    }

    let mut parts = Vec::new();
    for _ in common..source_parts.len() {
        parts.push("..".to_string());
    }
    parts.extend(target_parts[common..].iter().cloned());

    if parts.is_empty() {
        ".".to_string()
    } else {
        parts.join("/")
    }
}

fn split_rel_parts(path: &str) -> Vec<String> {
    path.split('/')
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect()
}

fn normalize_rel_path(path: &str) -> String {
    let mut parts = Vec::new();
    for component in Path::new(path).components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if parts.last().is_some_and(|part| part != "..") {
                    parts.pop();
                } else {
                    parts.push("..".to_string());
                }
            }
            Component::Normal(part) => parts.push(part.to_string_lossy().to_string()),
            Component::RootDir | Component::Prefix(_) => {}
        }
    }
    parts.join("/")
}

fn split_once_preserve(value: &str, delimiter: char) -> (&str, String) {
    if let Some(index) = value.find(delimiter) {
        (&value[..index], value[index..].to_string())
    } else {
        (value, String::new())
    }
}

fn strip_md_extension(path: &str) -> String {
    path.strip_suffix(".md").unwrap_or(path).to_string()
}

fn title_from_rel_path(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(path)
        .to_string()
}

pub fn plan_for_rename(
    root: &Path,
    from_abs: &Path,
    from_path: &str,
    to_path: &str,
) -> LinkRewritePlan {
    let is_dir = from_abs.is_dir();
    let from_title =
        note_title_for_path(root, from_path).unwrap_or_else(|| title_from_rel_path(from_path));
    let to_title = note_title_for_path(root, to_path)
        .or_else(|| note_title_for_path(root, from_path))
        .unwrap_or_else(|| title_from_rel_path(to_path));
    LinkRewritePlan {
        from_rel_path: if is_dir {
            from_path.trim_end_matches('/').to_string()
        } else {
            from_path.to_string()
        },
        to_rel_path: if is_dir {
            to_path.trim_end_matches('/').to_string()
        } else {
            to_path.to_string()
        },
        from_title,
        to_title,
        is_dir,
    }
}

fn note_title_for_path(root: &Path, rel_path: &str) -> Option<String> {
    let conn = index::open_db(root).ok()?;
    conn.query_row(
        "SELECT title FROM notes WHERE id = ? LIMIT 1",
        [rel_path],
        |row| row.get(0),
    )
    .ok()
}

fn is_external_target(target: &str) -> bool {
    target.starts_with("http://")
        || target.starts_with("https://")
        || target.starts_with("mailto:")
        || target.starts_with('#')
}

fn collect_markdown_files(space_root: &Path) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    let mut stack = vec![space_root.to_path_buf()];

    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name();
            if name.to_string_lossy().starts_with('.') {
                continue;
            }
            let Ok(meta) = entry.metadata() else {
                continue;
            };
            if meta.is_dir() {
                stack.push(path);
                continue;
            }
            if !meta.is_file() || !utils::is_markdown_path(&path) {
                continue;
            }
            let rel = path
                .strip_prefix(space_root)
                .map_err(|error| error.to_string())?;
            out.push(to_slash(rel));
        }
    }

    out.sort();
    Ok(out)
}

fn to_slash(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::{rewrite_markdown_links_for_path, LinkRewritePlan};

    fn plan() -> LinkRewritePlan {
        LinkRewritePlan {
            from_rel_path: "folder/old-title.md".to_string(),
            to_rel_path: "folder/new-title.md".to_string(),
            from_title: "Old Title".to_string(),
            to_title: "New Title".to_string(),
            is_dir: false,
        }
    }

    #[test]
    fn rewrites_title_alias_heading_path_and_markdown_links() {
        let input = "[[Old Title]] [[Old Title|Alias]] [[Old Title#Part]] [[folder/old-title]] [label](folder/old-title.md)";
        let output = rewrite_markdown_links_for_path(input, &plan(), "");

        assert_eq!(
            output.markdown,
            "[[New Title]] [[New Title|Alias]] [[New Title#Part]] [[folder/new-title]] [label](folder/new-title.md)"
        );
        assert_eq!(output.changed_links, 5);
    }

    #[test]
    fn does_not_rewrite_external_partial_or_fenced_links() {
        let input =
            "https://example.com/old-title.md [[Old Title Extended]]\n```\n[[Old Title]]\n```\n";
        let output = rewrite_markdown_links_for_path(input, &plan(), "");

        assert_eq!(output.markdown, input);
        assert_eq!(output.changed_links, 0);
    }

    #[test]
    fn rewrites_directory_path_prefixes() {
        let mut plan = plan();
        plan.from_rel_path = "old-dir".to_string();
        plan.to_rel_path = "new-dir".to_string();
        plan.is_dir = true;
        let output = rewrite_markdown_links_for_path("[[old-dir/a]] [a](old-dir/a.md)", &plan, "");

        assert_eq!(output.markdown, "[[new-dir/a]] [a](new-dir/a.md)");
        assert_eq!(output.changed_links, 2);
    }

    #[test]
    fn rewrites_markdown_links_relative_to_source_note() {
        let input = "[label](old-title.md) [root](folder/old-title.md)";
        let output = rewrite_markdown_links_for_path(input, &plan(), "folder/source.md");

        assert_eq!(
            output.markdown,
            "[label](new-title.md) [root](folder/new-title.md)"
        );
        assert_eq!(output.changed_links, 2);
    }

    #[test]
    fn normalizes_parent_segments_in_relative_markdown_links() {
        let input = "[label](../old-title.md)";
        let output = rewrite_markdown_links_for_path(input, &plan(), "folder/sub/source.md");

        assert_eq!(output.markdown, "[label](../new-title.md)");
        assert_eq!(output.changed_links, 1);
    }

    #[test]
    fn rewrites_outbound_relative_links_inside_moved_note() {
        let mut plan = plan();
        plan.from_rel_path = "folder/moved.md".to_string();
        plan.to_rel_path = "archive/moved.md".to_string();

        let input = "[sibling](sibling.md) [nested](sub/other.md)";
        let output = rewrite_markdown_links_for_path(input, &plan, "archive/moved.md");

        assert_eq!(
            output.markdown,
            "[sibling](../folder/sibling.md) [nested](../folder/sub/other.md)"
        );
        assert_eq!(output.changed_links, 2);
    }
}
