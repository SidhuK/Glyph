//! Allowlist parser for ADR 013 routes.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};
use url::Url;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DeeplinkAction {
    OpenNote { space: String, path: String },
    OpenSpace { space: String },
    Search { space: String, q: String },
    OpenDailyNote { space: String },
}

impl DeeplinkAction {
    pub fn space_path(&self) -> &str {
        match self {
            Self::OpenNote { space, .. }
            | Self::OpenSpace { space }
            | Self::Search { space, .. }
            | Self::OpenDailyNote { space } => space,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeeplinkError {
    InvalidUrl,
    WrongScheme,
    UnknownRoute,
    MissingParam(&'static str),
    UnexpectedParam(String),
    DuplicateParam(String),
    FragmentNotAllowed,
    InvalidSpacePath,
    NotePathAbsolute,
    NotePathTraversal,
    InvalidNotePath,
    EmptyParam(&'static str),
    SpaceNotFound,
    NoteNotFound,
    NoteNotMarkdown,
}

impl DeeplinkError {
    /// Coarse machine code for the UI. The frontend owns the wording so that
    /// deeplink failures are translated like every other user-facing string;
    /// the precise cause stays in the log via `Display`.
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidUrl
            | Self::WrongScheme
            | Self::UnknownRoute
            | Self::MissingParam(_)
            | Self::UnexpectedParam(_)
            | Self::DuplicateParam(_)
            | Self::FragmentNotAllowed
            | Self::InvalidSpacePath
            | Self::NotePathAbsolute
            | Self::NotePathTraversal
            | Self::InvalidNotePath
            | Self::EmptyParam(_) => "malformed",
            Self::SpaceNotFound => "space_not_found",
            Self::NoteNotFound => "note_not_found",
            Self::NoteNotMarkdown => "note_not_markdown",
        }
    }
}

impl std::fmt::Display for DeeplinkError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidUrl => write!(f, "invalid url"),
            Self::WrongScheme => write!(f, "unsupported scheme"),
            Self::UnknownRoute => write!(f, "unknown route"),
            Self::MissingParam(name) => write!(f, "missing required parameter `{name}`"),
            Self::UnexpectedParam(name) => write!(f, "unsupported parameter `{name}`"),
            Self::DuplicateParam(name) => write!(f, "duplicate parameter `{name}`"),
            Self::FragmentNotAllowed => write!(f, "fragments are not supported"),
            Self::InvalidSpacePath => write!(f, "space path is invalid"),
            Self::NotePathAbsolute => write!(f, "note path must be relative"),
            Self::NotePathTraversal => write!(f, "note path escapes the space"),
            Self::InvalidNotePath => write!(f, "note path is invalid"),
            Self::EmptyParam(name) => write!(f, "parameter `{name}` is empty"),
            Self::SpaceNotFound => write!(f, "space directory not found"),
            Self::NoteNotFound => write!(f, "note not found"),
            Self::NoteNotMarkdown => write!(f, "note is not a markdown file"),
        }
    }
}

impl std::error::Error for DeeplinkError {}

/// Parse a raw `glyph://…` URL into a typed action (ADR 013 allowlist only).
pub fn parse_deeplink_url(raw: &str) -> Result<DeeplinkAction, DeeplinkError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(DeeplinkError::InvalidUrl);
    }

    let url = Url::parse(trimmed).map_err(|_| DeeplinkError::InvalidUrl)?;
    if url.scheme() != "glyph" {
        return Err(DeeplinkError::WrongScheme);
    }
    if url.fragment().is_some() {
        return Err(DeeplinkError::FragmentNotAllowed);
    }

    let route = route_from_url(&url)?;
    let params = collect_query_params(&url)?;

    match route.as_str() {
        "open/note" => {
            expect_only_keys(&params, &["space", "path"])?;
            let space = require_space(&params)?;
            let path = require_note_path(&params)?;
            Ok(DeeplinkAction::OpenNote { space, path })
        }
        "open/space" => {
            expect_only_keys(&params, &["space"])?;
            let space = require_space(&params)?;
            Ok(DeeplinkAction::OpenSpace { space })
        }
        "search" => {
            expect_only_keys(&params, &["space", "q"])?;
            let space = require_space(&params)?;
            let q = require_nonempty(&params, "q")?;
            Ok(DeeplinkAction::Search { space, q })
        }
        "open/daily-note" => {
            expect_only_keys(&params, &["space"])?;
            let space = require_space(&params)?;
            Ok(DeeplinkAction::OpenDailyNote { space })
        }
        _ => Err(DeeplinkError::UnknownRoute),
    }
}

fn route_from_url(url: &Url) -> Result<String, DeeplinkError> {
    // Canonical shape: glyph://open/note → host "open", path "/note"
    // Also accept glyph:///open/note (empty host, path "/open/note").
    let host = url.host_str().unwrap_or("").trim().to_ascii_lowercase();
    let path = url.path().trim_matches('/');
    let path_lower = path.to_ascii_lowercase();

    if !host.is_empty() {
        if path_lower.is_empty() {
            return Ok(host);
        }
        return Ok(format!("{host}/{path_lower}"));
    }

    if path_lower.is_empty() {
        return Err(DeeplinkError::UnknownRoute);
    }
    Ok(path_lower)
}

fn collect_query_params(url: &Url) -> Result<BTreeMap<String, String>, DeeplinkError> {
    let mut map = BTreeMap::new();
    for (key, value) in url.query_pairs() {
        let key = key.to_string();
        if map.contains_key(&key) {
            return Err(DeeplinkError::DuplicateParam(key));
        }
        map.insert(key, value.to_string());
    }
    Ok(map)
}

fn expect_only_keys(
    params: &BTreeMap<String, String>,
    allowed: &[&str],
) -> Result<(), DeeplinkError> {
    for key in params.keys() {
        if !allowed.iter().any(|a| a == key) {
            return Err(DeeplinkError::UnexpectedParam(key.clone()));
        }
    }
    Ok(())
}

fn require_nonempty(
    params: &BTreeMap<String, String>,
    key: &'static str,
) -> Result<String, DeeplinkError> {
    let value = params
        .get(key)
        .ok_or(DeeplinkError::MissingParam(key))?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(DeeplinkError::EmptyParam(key));
    }
    Ok(trimmed.to_string())
}

fn require_space(params: &BTreeMap<String, String>) -> Result<String, DeeplinkError> {
    let raw = require_nonempty(params, "space")?;
    let normalized = normalize_space_path(&raw).map_err(|_| DeeplinkError::InvalidSpacePath)?;
    Ok(path_to_string(&normalized))
}

fn require_note_path(params: &BTreeMap<String, String>) -> Result<String, DeeplinkError> {
    let raw = require_nonempty(params, "path")?;
    normalize_note_rel_path(&raw)
}

/// Absolute space path: reject relative; canonicalize when the directory exists.
pub fn normalize_space_path(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("empty space path".to_string());
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err("space path must be absolute".to_string());
    }
    // Reject `.` / `..` components in the raw absolute path for stable identity.
    for component in path.components() {
        match component {
            Component::Prefix(_) | Component::RootDir | Component::Normal(_) => {}
            Component::CurDir | Component::ParentDir => {
                return Err("space path must not contain '.' or '..'".to_string());
            }
        }
    }
    if path.exists() {
        let canonical = path
            .canonicalize()
            .map_err(|e| format!("invalid space path: {e}"))?;
        if !canonical.is_dir() {
            return Err("space path is not a directory".to_string());
        }
        return Ok(canonical);
    }
    // Cold callers may pass a valid absolute path that is not yet readable; still
    // require absolute form. Existence is re-checked when opening the space.
    Ok(path)
}

fn normalize_note_rel_path(raw: &str) -> Result<String, DeeplinkError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(DeeplinkError::EmptyParam("path"));
    }
    // Absolute forms are invalid for note path= (ADR 008). Check before any
    // cosmetic slash stripping so "/etc/passwd" never becomes relative.
    if trimmed.starts_with('/') || trimmed.starts_with('\\') {
        return Err(DeeplinkError::NotePathAbsolute);
    }
    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err(DeeplinkError::NotePathAbsolute);
    }
    let mut parts: Vec<String> = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(seg) => {
                let s = seg.to_string_lossy();
                if s.is_empty() || s == "." {
                    continue;
                }
                if s == ".." {
                    return Err(DeeplinkError::NotePathTraversal);
                }
                parts.push(s.into_owned());
            }
            Component::CurDir => {}
            Component::ParentDir => return Err(DeeplinkError::NotePathTraversal),
            Component::RootDir | Component::Prefix(_) => {
                return Err(DeeplinkError::NotePathAbsolute);
            }
        }
    }
    if parts.is_empty() {
        return Err(DeeplinkError::EmptyParam("path"));
    }
    Ok(parts.join("/"))
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn abs_space() -> String {
        if cfg!(windows) {
            r"C:\vault".to_string()
        } else {
            "/Users/me/vault".to_string()
        }
    }

    fn encode(s: &str) -> String {
        urlencoding_lite(s)
    }

    fn urlencoding_lite(s: &str) -> String {
        let mut out = String::new();
        for b in s.bytes() {
            match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                    out.push(b as char);
                }
                b'\\' if cfg!(windows) => out.push('\\'),
                _ => out.push_str(&format!("%{b:02X}")),
            }
        }
        out
    }

    #[test]
    fn parses_open_note() {
        let space = abs_space();
        let raw = format!(
            "glyph://open/note?space={}&path={}",
            encode(&space),
            encode("notes/foo.md")
        );
        let action = parse_deeplink_url(&raw).unwrap();
        assert_eq!(
            action,
            DeeplinkAction::OpenNote {
                space: space.clone(),
                path: "notes/foo.md".to_string(),
            }
        );
    }

    #[test]
    fn parses_open_space_search_daily() {
        let space = abs_space();
        assert_eq!(
            parse_deeplink_url(&format!("glyph://open/space?space={}", encode(&space))).unwrap(),
            DeeplinkAction::OpenSpace {
                space: space.clone()
            }
        );
        assert_eq!(
            parse_deeplink_url(&format!(
                "glyph://search?space={}&q={}",
                encode(&space),
                encode("hello world")
            ))
            .unwrap(),
            DeeplinkAction::Search {
                space: space.clone(),
                q: "hello world".to_string(),
            }
        );
        assert_eq!(
            parse_deeplink_url(&format!(
                "glyph://open/daily-note?space={}",
                encode(&space)
            ))
            .unwrap(),
            DeeplinkAction::OpenDailyNote { space }
        );
    }

    #[test]
    fn rejects_unknown_route_and_wrong_scheme() {
        assert_eq!(
            parse_deeplink_url("glyph://open/calendar?space=/tmp"),
            Err(DeeplinkError::UnknownRoute)
        );
        assert_eq!(
            parse_deeplink_url("https://example.com/open/note"),
            Err(DeeplinkError::WrongScheme)
        );
    }

    #[test]
    fn rejects_missing_and_extra_params() {
        assert!(matches!(
            parse_deeplink_url("glyph://open/note?path=a.md"),
            Err(DeeplinkError::MissingParam("space"))
        ));
        assert!(matches!(
            parse_deeplink_url(&format!(
                "glyph://open/space?space={}&extra=1",
                encode(&abs_space())
            )),
            Err(DeeplinkError::UnexpectedParam(_))
        ));
    }

    #[test]
    fn rejects_relative_space_and_absolute_note_path() {
        assert!(matches!(
            parse_deeplink_url("glyph://open/space?space=relative/vault"),
            Err(DeeplinkError::InvalidSpacePath)
        ));
        let space = abs_space();
        assert!(matches!(
            parse_deeplink_url(&format!(
                "glyph://open/note?space={}&path={}",
                encode(&space),
                encode("/etc/passwd")
            )),
            Err(DeeplinkError::NotePathAbsolute)
        ));
        assert!(matches!(
            parse_deeplink_url(&format!(
                "glyph://open/note?space={}&path={}",
                encode(&space),
                encode("../secret.md")
            )),
            Err(DeeplinkError::NotePathTraversal)
        ));
    }

    #[test]
    fn rejects_fragments_and_duplicates() {
        let space = abs_space();
        assert_eq!(
            parse_deeplink_url(&format!(
                "glyph://open/space?space={}#frag",
                encode(&space)
            )),
            Err(DeeplinkError::FragmentNotAllowed)
        );
        assert!(matches!(
            parse_deeplink_url(&format!(
                "glyph://open/space?space={}&space={}",
                encode(&space),
                encode(&space)
            )),
            Err(DeeplinkError::DuplicateParam(_))
        ));
    }

    #[test]
    fn unicode_and_spaces_round_trip_in_query() {
        let space = abs_space();
        let note = "notes/こんにちは world.md";
        let raw = format!(
            "glyph://open/note?space={}&path={}",
            encode(&space),
            encode(note)
        );
        let action = parse_deeplink_url(&raw).unwrap();
        match action {
            DeeplinkAction::OpenNote { path, .. } => assert_eq!(path, note),
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn empty_host_path_form_accepted() {
        let space = abs_space();
        let raw = format!("glyph:///open/space?space={}", encode(&space));
        assert_eq!(
            parse_deeplink_url(&raw).unwrap(),
            DeeplinkAction::OpenSpace { space }
        );
    }
}
