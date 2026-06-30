use std::{collections::HashSet, path::Path};

use crate::utils;

pub fn normalize_rel_path(raw: &str) -> Option<String> {
    let raw = raw.replace('\\', "/");
    let raw = raw.trim().trim_matches('/');
    if raw.is_empty() {
        return None;
    }
    let mut out: Vec<String> = Vec::new();
    for part in raw.split('/') {
        let part = part.trim();
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            out.pop()?;
            continue;
        }
        if part.starts_with('.') {
            return None;
        }
        out.push(part.to_string());
    }
    if out.is_empty() {
        None
    } else {
        Some(out.join("/"))
    }
}

pub fn parse_outgoing_links(
    from_rel_path: &str,
    markdown: &str,
) -> (HashSet<String>, HashSet<String>) {
    let mut paths = HashSet::new();
    let mut titles = HashSet::new();

    let from_dir = Path::new(from_rel_path)
        .parent()
        .unwrap_or_else(|| Path::new(""));
    let from_dir = from_dir.to_string_lossy().replace('\\', "/");

    let mut i = 0;
    let bytes = markdown.as_bytes();
    while i + 4 <= bytes.len() {
        if bytes[i] == b'[' && bytes[i + 1] == b'[' {
            if let Some(end) = markdown[i + 2..].find("]]") {
                let inner = &markdown[i + 2..i + 2 + end];
                let inner = inner.trim();
                let inner = inner.split('|').next().unwrap_or(inner).trim();
                let inner = inner.split('#').next().unwrap_or(inner).trim();
                if !inner.is_empty() {
                    if is_file_wikilink_target(inner) {
                        let p = if should_append_markdown_extension(inner) {
                            format!("{inner}.md")
                        } else {
                            inner.to_string()
                        };
                        if let Some(p) = normalize_rel_path(&p) {
                            paths.insert(p);
                        }
                    } else {
                        titles.insert(inner.to_string());
                    }
                }
                i = i + 2 + end + 2;
                continue;
            }
        }
        i += 1;
    }

    let mut j = 0;
    while let Some(start) = markdown[j..].find("](") {
        let open = j + start + 2;
        if let Some(close_rel) = markdown[open..].find(')') {
            let close = open + close_rel;
            let mut target = markdown[open..close]
                .trim()
                .trim_matches('<')
                .trim_matches('>');
            if let Some(hash) = target.find('#') {
                target = &target[..hash];
            }
            if let Some(q) = target.find('?') {
                target = &target[..q];
            }
            if target.starts_with("http://")
                || target.starts_with("https://")
                || target.starts_with("mailto:")
            {
                j = close + 1;
                continue;
            }
            if !is_linkable_file_target(target) {
                j = close + 1;
                continue;
            }

            let raw_rel = if target.starts_with('/') {
                target.trim_start_matches('/').to_string()
            } else if from_dir.is_empty() {
                target.to_string()
            } else {
                format!("{from_dir}/{target}")
            };
            if let Some(p) = normalize_rel_path(&raw_rel) {
                paths.insert(p);
            }

            j = close + 1;
            continue;
        }
        break;
    }

    (paths, titles)
}

fn is_file_wikilink_target(target: &str) -> bool {
    is_linkable_file_target(target)
        || (target.contains('/') && !utils::has_explicit_file_extension(target))
}

fn should_append_markdown_extension(target: &str) -> bool {
    target.contains('/') && !utils::has_explicit_file_extension(target)
}

fn is_linkable_file_target(target: &str) -> bool {
    utils::has_wikilink_file_extension(target)
}

#[cfg(test)]
mod tests {
    use super::parse_outgoing_links;

    #[test]
    fn parses_attachment_wikilinks_as_file_paths() {
        let (paths, titles) = parse_outgoing_links(
            "notes/source.md",
            "[[assets/logo.png]] [[spec.pdf]] [[Project]] ![[hero.webp]]",
        );

        assert!(paths.contains("assets/logo.png"));
        assert!(paths.contains("spec.pdf"));
        assert!(paths.contains("hero.webp"));
        assert!(titles.contains("Project"));
    }

    #[test]
    fn parses_attachment_markdown_links_relative_to_source() {
        let (paths, titles) = parse_outgoing_links(
            "notes/source.md",
            "[logo](../assets/logo.png) [note](peer.md)",
        );

        assert!(paths.contains("assets/logo.png"));
        assert!(paths.contains("notes/peer.md"));
        assert!(titles.is_empty());
    }

    #[test]
    fn parses_nested_dotted_wikilink_as_markdown_path() {
        let (paths, titles) =
            parse_outgoing_links("notes/source.md", "[[projects/0.5.6 project hail mary]]");

        assert!(paths.contains("projects/0.5.6 project hail mary.md"));
        assert!(titles.is_empty());
    }

    #[test]
    fn does_not_rewrite_unsupported_explicit_wikilink_extensions_as_markdown() {
        let (paths, titles) =
            parse_outgoing_links("notes/source.md", "[[assets/archive.zip]] [[data.csv]]");

        assert!(!paths.contains("assets/archive.zip"));
        assert!(!paths.contains("assets/archive.zip.md"));
        assert!(!paths.contains("data.csv.md"));
        assert!(titles.contains("assets/archive.zip"));
        assert!(titles.contains("data.csv"));
    }
}
