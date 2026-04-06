use super::frontmatter::split_frontmatter;
use std::collections::BTreeMap;

pub const PEOPLE_TAG_NAMESPACE: &str = "people/";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedTag {
    pub tag: String,
    pub is_explicit: bool,
}

pub fn normalize_tag(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let normalized = trimmed.trim_start_matches('#').trim().to_lowercase();
    if normalized.is_empty() || normalized.starts_with('/') || normalized.ends_with('/') {
        return None;
    }
    let mut segments = Vec::new();
    for segment in normalized.split('/') {
        if segment.is_empty() {
            return None;
        }
        if !segment
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        {
            return None;
        }
        segments.push(segment);
    }
    Some(segments.join("/"))
}

pub fn normalize_person_handle(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let normalized = trimmed.trim_start_matches('@').trim().to_lowercase();
    if normalized.is_empty() {
        return None;
    }
    if !normalized
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return None;
    }
    Some(normalized)
}

pub fn person_handle_to_tag(handle: &str) -> Option<String> {
    normalize_person_handle(handle).map(|normalized| format!("{PEOPLE_TAG_NAMESPACE}{normalized}"))
}

pub fn people_tag_to_handle(tag: &str) -> Option<String> {
    tag.strip_prefix(PEOPLE_TAG_NAMESPACE)
        .and_then(normalize_person_handle)
}

pub fn tag_depth(tag: &str) -> usize {
    tag.matches('/').count()
}

pub fn tag_matches_hierarchy(filter: &str, candidate: &str) -> bool {
    candidate == filter
        || candidate
            .strip_prefix(filter)
            .is_some_and(|suffix| suffix.starts_with('/'))
}

pub fn expand_indexed_tags(explicit_tags: &[String]) -> Vec<IndexedTag> {
    let mut expanded = BTreeMap::<String, bool>::new();
    for explicit_tag in explicit_tags {
        let mut prefix = String::new();
        for (index, segment) in explicit_tag.split('/').enumerate() {
            if index > 0 {
                prefix.push('/');
            }
            prefix.push_str(segment);
            let is_explicit = index + 1 == explicit_tag.split('/').count();
            expanded
                .entry(prefix.clone())
                .and_modify(|current| *current |= is_explicit)
                .or_insert(is_explicit);
        }
    }
    expanded
        .into_iter()
        .map(|(tag, is_explicit)| IndexedTag { tag, is_explicit })
        .collect()
}

pub fn expand_indexed_people(explicit_people: &[String]) -> Vec<IndexedTag> {
    explicit_people
        .iter()
        .filter_map(|handle| {
            person_handle_to_tag(handle).map(|tag| IndexedTag {
                tag,
                is_explicit: true,
            })
        })
        .collect()
}

pub fn parse_frontmatter_tags(markdown: &str) -> Vec<String> {
    let markdown = markdown.strip_prefix('\u{feff}').unwrap_or(markdown);
    let (yaml, _body) = split_frontmatter(markdown);
    if yaml.is_empty() {
        return Vec::new();
    }
    let v: serde_yaml::Value = match serde_yaml::from_str(yaml) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let mut out = Vec::new();
    if let Some(tags_val) = extract_tags_value(&v) {
        collect_tags_from_yaml_value(tags_val, &mut out);
    }
    out.sort();
    out.dedup();
    out
}

fn extract_tags_value(value: &serde_yaml::Value) -> Option<&serde_yaml::Value> {
    let map = value.as_mapping()?;
    map.iter().find_map(|(key, val)| {
        key.as_str()
            .map(|k| k.eq_ignore_ascii_case("tags"))
            .filter(|matched| *matched)
            .map(|_| val)
    })
}

fn collect_tags_from_yaml_value(value: &serde_yaml::Value, out: &mut Vec<String>) {
    match value {
        serde_yaml::Value::Sequence(items) => {
            for item in items {
                collect_tags_from_yaml_value(item, out);
            }
        }
        serde_yaml::Value::String(s) => {
            collect_tags_from_string(s, out);
        }
        serde_yaml::Value::Number(n) => {
            if let Some(t) = normalize_tag(&n.to_string()) {
                out.push(t);
            }
        }
        _ => {}
    }
}

fn collect_tags_from_string(raw: &str, out: &mut Vec<String>) {
    let parts = if raw.contains(',') {
        raw.split(',').map(|p| p.trim()).collect::<Vec<_>>()
    } else {
        raw.split_whitespace().collect::<Vec<_>>()
    };
    for part in parts {
        if let Some(t) = normalize_tag(part) {
            out.push(t);
        }
    }
}

pub fn parse_inline_tags(markdown: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut in_fence = false;
    for line in markdown.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        let mut cleaned = String::new();
        let mut in_code = false;
        for ch in line.chars() {
            if ch == '`' {
                in_code = !in_code;
                continue;
            }
            if !in_code {
                cleaned.push(ch);
            }
        }

        let bytes = cleaned.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'#' {
                let prev = if i == 0 { b' ' } else { bytes[i - 1] };
                let prev_ok =
                    !(prev as char).is_ascii_alphanumeric() && prev != b'/' && prev != b'_';
                if !prev_ok {
                    i += 1;
                    continue;
                }
                let mut j = i + 1;
                while j < bytes.len() {
                    let c = bytes[j] as char;
                    if c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '/' {
                        j += 1;
                        continue;
                    }
                    break;
                }
                if j > i + 1 {
                    let candidate = &cleaned[i + 1..j];
                    if let Some(t) = normalize_tag(candidate) {
                        out.push(t);
                    }
                }
                i = j;
                continue;
            }
            i += 1;
        }
    }
    out.sort();
    out.dedup();
    out
}

pub fn parse_inline_people(markdown: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut in_fence = false;
    for line in markdown.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        let mut cleaned = String::new();
        let mut in_code = false;
        for ch in line.chars() {
            if ch == '`' {
                in_code = !in_code;
                continue;
            }
            if !in_code {
                cleaned.push(ch);
            }
        }

        let bytes = cleaned.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'@' {
                let prev = if i == 0 { b' ' } else { bytes[i - 1] };
                let prev_ok = !(prev as char).is_ascii_alphanumeric()
                    && prev != b'_'
                    && prev != b'-'
                    && prev != b'.'
                    && prev != b'/';
                if !prev_ok {
                    i += 1;
                    continue;
                }
                let mut j = i + 1;
                while j < bytes.len() {
                    let c = bytes[j] as char;
                    if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                        j += 1;
                        continue;
                    }
                    break;
                }
                let next = bytes.get(j).copied();
                if next == Some(b'@') {
                    i = j;
                    continue;
                }
                if j > i + 1 {
                    let candidate = &cleaned[i + 1..j];
                    if let Some(handle) = normalize_person_handle(candidate) {
                        out.push(handle);
                    }
                }
                i = j;
                continue;
            }
            i += 1;
        }
    }
    out.sort();
    out.dedup();
    out
}

pub fn parse_all_tags(markdown: &str) -> Vec<String> {
    let mut out = parse_frontmatter_tags(markdown);
    out.extend(parse_inline_tags(markdown));
    out.sort();
    out.dedup();
    out
}

#[cfg(test)]
mod tests {
    use super::{
        expand_indexed_people, expand_indexed_tags, normalize_person_handle, normalize_tag,
        parse_all_tags, parse_inline_people, people_tag_to_handle, person_handle_to_tag,
        tag_depth, tag_matches_hierarchy,
    };

    #[test]
    fn normalizes_nested_tags_and_rejects_empty_segments() {
        assert_eq!(
            normalize_tag("#work/Today/Further"),
            Some("work/today/further".to_string())
        );
        assert_eq!(normalize_tag("#work//today"), None);
        assert_eq!(normalize_tag("#work/"), None);
        assert_eq!(normalize_tag("#/today"), None);
    }

    #[test]
    fn expands_explicit_tags_into_virtual_parents() {
        let expanded = expand_indexed_tags(&["work/today/further".to_string()]);
        assert_eq!(
            expanded,
            vec![
                super::IndexedTag {
                    tag: "work".to_string(),
                    is_explicit: false,
                },
                super::IndexedTag {
                    tag: "work/today".to_string(),
                    is_explicit: false,
                },
                super::IndexedTag {
                    tag: "work/today/further".to_string(),
                    is_explicit: true,
                },
            ]
        );
    }

    #[test]
    fn explicit_parent_wins_when_shared_with_child() {
        let expanded = expand_indexed_tags(&["work".to_string(), "work/today/further".to_string()]);
        assert_eq!(expanded[0].tag, "work");
        assert!(expanded[0].is_explicit);
    }

    #[test]
    fn matches_nested_hierarchy_by_prefix_boundary() {
        assert!(tag_matches_hierarchy("work", "work"));
        assert!(tag_matches_hierarchy("work", "work/today"));
        assert!(!tag_matches_hierarchy("work", "workshop"));
        assert_eq!(tag_depth("work/today/further"), 2);
    }

    #[test]
    fn parses_nested_inline_tags() {
        let markdown = "#work/today/further\n\nBody #projects/roadmap";
        assert_eq!(
            parse_all_tags(markdown),
            vec![
                "projects/roadmap".to_string(),
                "work/today/further".to_string()
            ]
        );
    }

    #[test]
    fn normalizes_person_handles() {
        assert_eq!(normalize_person_handle("@Alice-Jones"), Some("alice-jones".to_string()));
        assert_eq!(normalize_person_handle("@alice_smith"), Some("alice_smith".to_string()));
        assert_eq!(normalize_person_handle("@alice jones"), None);
    }

    #[test]
    fn expands_people_without_virtual_parents() {
        assert_eq!(
            expand_indexed_people(&["alice".to_string()]),
            vec![super::IndexedTag {
                tag: "people/alice".to_string(),
                is_explicit: true,
            }]
        );
    }

    #[test]
    fn parses_inline_people_and_skips_emails_and_code() {
        let markdown = r#"
Email alice@example.com should not count.
Standalone @alice and @alice-jones and @alice_smith should.
Ignore `@inline_code`.
```ts
const value = "@fenced";
```
Ignore foo@bar too.
Ignore /@pathlike too.
"#;
        assert_eq!(
            parse_inline_people(markdown),
            vec![
                "alice".to_string(),
                "alice-jones".to_string(),
                "alice_smith".to_string()
            ]
        );
    }

    #[test]
    fn round_trips_people_tags() {
        assert_eq!(person_handle_to_tag("@alice"), Some("people/alice".to_string()));
        assert_eq!(people_tag_to_handle("people/alice"), Some("alice".to_string()));
        assert_eq!(people_tag_to_handle("work/alice"), None);
    }
}
