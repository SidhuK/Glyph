use std::{collections::HashSet, path::Path};

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
                    if inner.contains('/') || inner.ends_with(".md") {
                        let p = if inner.ends_with(".md") {
                            inner.to_string()
                        } else {
                            format!("{inner}.md")
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
            if !target.ends_with(".md") {
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
