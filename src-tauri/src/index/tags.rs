use super::frontmatter::split_frontmatter;
use regex::Regex;
use std::collections::BTreeMap;
use std::sync::OnceLock;

pub const PEOPLE_TAG_NAMESPACE: &str = "people/";

/// Keep in sync with `INLINE_TAG_PATTERN` / segment rules in
/// `src/components/editor/noteProperties/utils.ts`.
static TAG_SEGMENT_PATTERN: OnceLock<Regex> = OnceLock::new();
static INLINE_TAG_PATTERN: OnceLock<Regex> = OnceLock::new();

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedTag {
    pub tag: String,
    pub is_explicit: bool,
}

fn tag_segment_pattern() -> &'static Regex {
    TAG_SEGMENT_PATTERN.get_or_init(|| {
        Regex::new(r"^[\p{L}\p{N}_][\p{L}\p{M}\p{N}_-]*$")
            .expect("tag segment pattern must compile")
    })
}

fn inline_tag_pattern() -> &'static Regex {
    INLINE_TAG_PATTERN.get_or_init(|| {
        Regex::new(r"(^|[^\p{L}\p{M}\p{N}_/#])#([\p{L}\p{N}_][\p{L}\p{M}\p{N}_/-]*)")
            .expect("inline tag pattern must compile")
    })
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
        if segment.is_empty() || !tag_segment_pattern().is_match(segment) {
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

fn is_html_name_start(byte: u8) -> bool {
    byte.is_ascii_alphabetic() || byte == b'_' || byte == b':'
}

fn is_html_name_char(byte: u8) -> bool {
    is_html_name_start(byte) || byte.is_ascii_digit() || byte == b'-' || byte == b'.'
}

fn skip_ascii_whitespace(bytes: &[u8], mut index: usize) -> usize {
    while bytes.get(index).is_some_and(u8::is_ascii_whitespace) {
        index += 1;
    }
    index
}

fn find_bytes(haystack: &[u8], start: usize, needle: &[u8]) -> Option<usize> {
    haystack[start..]
        .windows(needle.len())
        .position(|window| window == needle)
        .map(|index| start + index)
}

fn html_tag_end(markdown: &str, start: usize) -> Option<usize> {
    let bytes = markdown.as_bytes();
    if bytes.get(start) != Some(&b'<') {
        return None;
    }

    let mut i = start + 1;
    match bytes.get(i).copied()? {
        b'!' => {
            if bytes.get(start..start + 4) == Some(b"<!--") {
                return find_bytes(bytes, start + 4, b"-->").map(|end| end + 3);
            }
            return bytes[i..]
                .iter()
                .position(|byte| *byte == b'>')
                .map(|offset| i + offset + 1);
        }
        b'?' => {
            return find_bytes(bytes, i + 1, b"?>")
                .map(|end| end + 2)
                .or_else(|| {
                    bytes[i..]
                        .iter()
                        .position(|byte| *byte == b'>')
                        .map(|offset| i + offset + 1)
                });
        }
        b'/' => i += 1,
        _ => {}
    }

    if !bytes.get(i).copied().is_some_and(is_html_name_start) {
        return None;
    }
    i += 1;
    while bytes.get(i).copied().is_some_and(is_html_name_char) {
        i += 1;
    }

    loop {
        i = skip_ascii_whitespace(bytes, i);
        match bytes.get(i).copied()? {
            b'>' => return Some(i + 1),
            b'/' => {
                i = skip_ascii_whitespace(bytes, i + 1);
                return (bytes.get(i) == Some(&b'>')).then_some(i + 1);
            }
            byte if is_html_name_start(byte) => {
                i += 1;
                while bytes.get(i).copied().is_some_and(is_html_name_char) {
                    i += 1;
                }
                i = skip_ascii_whitespace(bytes, i);
                if bytes.get(i) != Some(&b'=') {
                    continue;
                }
                i = skip_ascii_whitespace(bytes, i + 1);
                match bytes.get(i).copied()? {
                    b'\'' | b'"' => {
                        let quote = bytes[i];
                        i += 1;
                        while bytes.get(i).copied()? != quote {
                            i += 1;
                        }
                        i += 1;
                    }
                    b'>' => return None,
                    _ => {
                        while bytes
                            .get(i)
                            .is_some_and(|byte| !byte.is_ascii_whitespace() && *byte != b'>')
                        {
                            i += 1;
                        }
                    }
                }
            }
            _ => return None,
        }
    }
}

fn skip_line(markdown: &str, start: usize, out: &mut String) -> usize {
    let bytes = markdown.as_bytes();
    let Some(offset) = bytes[start..].iter().position(|byte| *byte == b'\n') else {
        out.push(' ');
        return bytes.len();
    };
    out.push('\n');
    start + offset + 1
}

fn count_backticks(bytes: &[u8], mut index: usize) -> usize {
    let start = index;
    while bytes.get(index) == Some(&b'`') {
        index += 1;
    }
    index - start
}

fn metadata_scan_text(markdown: &str) -> String {
    let bytes = markdown.as_bytes();
    let mut cleaned = String::with_capacity(markdown.len());
    let mut i = 0;
    let mut line_start = true;
    let mut in_fence = false;
    let mut fence_backticks = 0;
    let mut code_backticks = 0;

    while i < bytes.len() {
        if line_start {
            let line_end = bytes[i..]
                .iter()
                .position(|byte| *byte == b'\n')
                .map_or(bytes.len(), |offset| i + offset);
            let line_content = markdown[i..line_end].trim_start();
            let backticks = count_backticks(line_content.as_bytes(), 0);
            if backticks >= 3 && (!in_fence || backticks >= fence_backticks) {
                in_fence = !in_fence;
                fence_backticks = if in_fence { backticks } else { 0 };
                i = skip_line(markdown, i, &mut cleaned);
                line_start = true;
                code_backticks = 0;
                continue;
            }
            if in_fence {
                i = skip_line(markdown, i, &mut cleaned);
                line_start = true;
                code_backticks = 0;
                continue;
            }
            line_start = false;
        }

        if bytes[i] == b'\n' {
            cleaned.push('\n');
            i += 1;
            line_start = true;
            code_backticks = 0;
            continue;
        }
        if bytes[i] == b'`' {
            let backticks = count_backticks(bytes, i);
            if code_backticks == 0 {
                code_backticks = backticks;
            } else if backticks == code_backticks {
                code_backticks = 0;
            }
            i += backticks;
            continue;
        }
        if code_backticks > 0 {
            let Some(ch) = markdown[i..].chars().next() else {
                break;
            };
            i += ch.len_utf8();
            continue;
        }
        if bytes[i] == b'<' {
            if let Some(end) = html_tag_end(markdown, i) {
                cleaned.push(' ');
                i = end;
                continue;
            }
        }

        let Some(ch) = markdown[i..].chars().next() else {
            break;
        };
        cleaned.push(ch);
        i += ch.len_utf8();
    }

    cleaned
}

fn is_css_color_property(property: &str) -> bool {
    property == "color"
        || property.ends_with("-color")
        || property.starts_with("--")
        || matches!(
            property,
            "background"
                | "border"
                | "border-block"
                | "border-block-end"
                | "border-block-start"
                | "border-bottom"
                | "border-inline"
                | "border-inline-end"
                | "border-inline-start"
                | "border-left"
                | "border-right"
                | "border-top"
                | "box-shadow"
                | "fill"
                | "outline"
                | "stroke"
                | "text-shadow"
        )
}

fn is_css_hex_color_literal(text: &str, hash_index: usize, candidate: &str) -> bool {
    if !matches!(candidate.len(), 3 | 4 | 6 | 8)
        || !candidate.chars().all(|c| c.is_ascii_hexdigit())
    {
        return false;
    }

    let before_hash = &text[..hash_index];
    let Some(open_rule) = before_hash.rfind('{') else {
        return false;
    };
    if before_hash
        .rfind('}')
        .is_some_and(|close_rule| close_rule > open_rule)
    {
        return false;
    }

    let declaration_start = before_hash
        .rfind([';', '{', '}'])
        .map_or(0, |index| index + 1);
    let declaration_prefix = text[declaration_start..hash_index].trim();
    let Some((property, _value_prefix)) = declaration_prefix.split_once(':') else {
        return false;
    };
    let property = property.trim().to_ascii_lowercase();
    let property = property.as_str();

    !property.is_empty()
        && property
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
        && is_css_color_property(property)
}

pub fn parse_inline_tags(markdown: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let cleaned = metadata_scan_text(markdown);
    for caps in inline_tag_pattern().captures_iter(&cleaned) {
        let Some(full) = caps.get(0) else {
            continue;
        };
        let leading_len = caps.get(1).map_or(0, |m| m.len());
        let Some(candidate) = caps.get(2).map(|m| m.as_str()) else {
            continue;
        };
        let hash_index = full.start() + leading_len;
        if is_css_hex_color_literal(&cleaned, hash_index, candidate) {
            continue;
        }
        if let Some(t) = normalize_tag(candidate) {
            out.push(t);
        }
    }
    out.sort();
    out.dedup();
    out
}

pub fn parse_inline_people(markdown: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let cleaned = metadata_scan_text(markdown);
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
        parse_all_tags, parse_inline_people, parse_inline_tags, people_tag_to_handle,
        person_handle_to_tag, tag_depth, tag_matches_hierarchy,
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
        assert_eq!(normalize_tag("#\u{0301}accent"), None);
    }

    #[test]
    fn normalizes_and_parses_unicode_tags() {
        assert_eq!(
            normalize_tag("#Næring/ØL/År"),
            Some("næring/øl/år".to_string())
        );
        assert_eq!(normalize_tag("#İ"), Some("i̇".to_string()));
        assert_eq!(
            parse_inline_tags("Topics: #næring, #øl, and #år."),
            vec!["næring".to_string(), "år".to_string(), "øl".to_string()]
        );
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
    fn skips_tags_inside_matching_length_inline_code_spans() {
        let markdown = "Keep ``code with ` #not-a-tag`` and #actual.";

        assert_eq!(parse_inline_tags(markdown), vec!["actual".to_string()]);
    }

    #[test]
    fn skips_tags_inside_longer_backtick_fences() {
        let markdown = r#"
````md
``` #not-a-tag
still #not-a-tag
```
````
Keep #actual.
"#;

        assert_eq!(parse_inline_tags(markdown), vec!["actual".to_string()]);
    }

    #[test]
    fn skips_tags_inside_inline_html_attributes() {
        let markdown = r##"
## <span style="background-color: #00C6BD;" title="#not-a-tag">Styled heading</span>
Body <span data-label="#also-not-a-tag">#actual-tag</span>
"##;

        assert_eq!(parse_inline_tags(markdown), vec!["actual-tag".to_string()]);
    }

    #[test]
    fn skips_tags_and_people_inside_multiline_html_attributes() {
        let markdown = r##"
<span
  data-owner="@inline_html_attribute"
  style="color: #00C6BD"
>
Visible #actual-tag and @actual-person.
</span>
"##;

        assert_eq!(parse_inline_tags(markdown), vec!["actual-tag".to_string()]);
        assert_eq!(
            parse_inline_people(markdown),
            vec!["actual-person".to_string()]
        );
    }

    #[test]
    fn preserves_tags_and_people_inside_non_html_angle_brackets() {
        let markdown = "Discuss <todo #project @alice> tomorrow.";

        assert_eq!(parse_inline_tags(markdown), vec!["project".to_string()]);
        assert_eq!(parse_inline_people(markdown), vec!["alice".to_string()]);
    }

    #[test]
    fn skips_css_hex_color_literals_in_css_declarations() {
        let markdown = r##"
.swatch { color: #fff; background: #00C6BD; border-color: #abcd; box-shadow: 0 0 #ff00aa80; }
Keep #project and #00C6BD/design.
"##;

        assert_eq!(
            parse_inline_tags(markdown),
            vec!["00c6bd/design".to_string(), "project".to_string()]
        );
    }

    #[test]
    fn skips_css_hex_color_literals_in_multiline_css_blocks() {
        let markdown = r##"
.swatch {
  color: #fff;
  background: #00C6BD;
}
Keep #project.
"##;

        assert_eq!(parse_inline_tags(markdown), vec!["project".to_string()]);
    }

    #[test]
    fn preserves_hex_shaped_tags_after_prose_property_labels() {
        let markdown = "Color: #facade\nBackground: #decade\nBorder color: #badcab";

        assert_eq!(
            parse_inline_tags(markdown),
            vec![
                "badcab".to_string(),
                "decade".to_string(),
                "facade".to_string()
            ]
        );
    }

    #[test]
    fn preserves_standalone_hex_shaped_inline_tags() {
        let markdown =
            "Keep #fff #abcd #202406 #20240626 #decade #facade #deface. Note: #deadbeef.";

        assert_eq!(
            parse_inline_tags(markdown),
            vec![
                "202406".to_string(),
                "20240626".to_string(),
                "abcd".to_string(),
                "deadbeef".to_string(),
                "decade".to_string(),
                "deface".to_string(),
                "facade".to_string(),
                "fff".to_string()
            ]
        );
    }

    #[test]
    fn normalizes_person_handles() {
        assert_eq!(
            normalize_person_handle("@Alice-Jones"),
            Some("alice-jones".to_string())
        );
        assert_eq!(
            normalize_person_handle("@alice_smith"),
            Some("alice_smith".to_string())
        );
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
Ignore <span data-owner="@inline_html_attribute">html attrs</span> too.
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
        assert_eq!(
            person_handle_to_tag("@alice"),
            Some("people/alice".to_string())
        );
        assert_eq!(
            people_tag_to_handle("people/alice"),
            Some("alice".to_string())
        );
        assert_eq!(people_tag_to_handle("work/alice"), None);
    }
}
