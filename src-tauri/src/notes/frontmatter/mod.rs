use serde_yaml::{Mapping, Value};

mod edit;

pub use edit::{line_ending, set_frontmatter_key, set_yaml_key};

pub fn split_frontmatter(markdown: &str) -> (Option<&str>, &str) {
    if let Some(rest) = markdown.strip_prefix("---\n") {
        if let Some(idx) = rest.find("\n---\n") {
            let fm = &rest[..idx];
            let body = &rest[idx + "\n---\n".len()..];
            return (Some(fm), body);
        }
        if let Some(idx) = rest.find("\n---\r\n") {
            let fm = &rest[..idx];
            let body = &rest[idx + "\n---\r\n".len()..];
            return (Some(fm), body);
        }
        return (None, markdown);
    }

    if let Some(rest) = markdown.strip_prefix("---\r\n") {
        if let Some(idx) = rest.find("\r\n---\r\n") {
            let fm = &rest[..idx];
            let body = &rest[idx + "\r\n---\r\n".len()..];
            return (Some(fm), body);
        }
        if let Some(idx) = rest.find("\r\n---\n") {
            let fm = &rest[..idx];
            let body = &rest[idx + "\r\n---\n".len()..];
            return (Some(fm), body);
        }
        return (None, markdown);
    }

    (None, markdown)
}

pub fn parse_frontmatter_mapping(yaml: Option<&str>) -> Result<Mapping, String> {
    match yaml {
        None => Ok(Mapping::new()),
        Some(s) if s.trim().is_empty() => Ok(Mapping::new()),
        Some(s) => serde_yaml::from_str::<Mapping>(s).map_err(|e| e.to_string()),
    }
}

pub fn render_frontmatter_mapping_yaml(mapping: &Mapping) -> Result<String, String> {
    serde_yaml::to_string(mapping).map_err(|e| e.to_string())
}

/// Change only the archive field; never reserialize unrelated YAML or the note body.
pub fn set_archived(markdown: &str, archived: bool) -> Result<String, String> {
    let (yaml, _) = split_frontmatter(markdown.strip_prefix('\u{feff}').unwrap_or(markdown));
    let current = parse_frontmatter_mapping(yaml)?.get("archived").cloned();
    if current.as_ref().is_some_and(|value| !value.is_bool()) {
        return Err("The archived property must be a boolean".into());
    }
    if current.and_then(|value| value.as_bool()).unwrap_or(false) == archived {
        return Ok(markdown.to_string());
    }
    set_frontmatter_key(markdown, "archived", archived.then_some(&Value::Bool(true)))
}

#[cfg(test)]
mod archive_tests {
    use super::{set_archived, split_frontmatter};

    #[test]
    fn preserves_comments_scalars_and_body() {
        let note = "---\ntitle: 'A note' # title\n# keep this\ndescription: |\n  several lines\n  of text\n---\nBody\n";
        let archived = set_archived(note, true).unwrap();
        assert_eq!(archived, note.replacen("---\n", "---\narchived: true\n", 1));
        let restored = set_archived(&archived, false).unwrap();
        assert!(restored.contains(
            "title: 'A note' # title\n# keep this\ndescription: |\n  several lines\n  of text"
        ));
        assert_eq!(split_frontmatter(&restored).1, "Body\n");
    }

    #[test]
    fn retains_empty_frontmatter_before_body_rule() {
        let restored =
            set_archived("---\narchived: true # keep\n---\n---\nbody\n---\n", false).unwrap();
        assert!(restored.contains("# keep"));
        assert_eq!(split_frontmatter(&restored).1, "---\nbody\n---\n");
        assert!(set_archived(&restored, true).is_ok());
    }

    #[test]
    fn archives_leading_thematic_break_without_changing_body() {
        for body in ["---\nA note\n", "---\r\nA note\r\n", "A note\r\nBody\r\n"] {
            let archived = set_archived(body, true).unwrap();
            let newline = if body.contains("\r\n") { "\r\n" } else { "\n" };
            assert_eq!(archived, format!("---{newline}archived: true{newline}---{newline}{body}"));
            assert_eq!(split_frontmatter(&archived).1, body);
            let restored = set_archived(&archived, false).unwrap();
            assert_eq!(split_frontmatter(&restored).1, body);
        }
    }

    #[test]
    fn preserves_crlf_and_rejects_unsafe_rewrites() {
        let note = "---\r\ntitle: Test\r\narchived: false # keep\r\n---\r\nbody";
        assert_eq!(
            set_archived(note, true).unwrap(),
            note.replace("archived: false", "archived: true")
        );
        assert!(set_archived("---\n{title: Test, archived: true}\n---\nbody", false).is_err());
        assert!(set_archived("---\narchived: personal value\n---\nbody", true).is_err());
    }
}
