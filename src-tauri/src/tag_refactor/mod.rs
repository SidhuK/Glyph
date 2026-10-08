pub mod commands;
mod frontmatter;
mod inline;

use serde::Serialize;

use crate::index::tags::{
    normalize_tag, parse_all_tags, tag_matches_hierarchy, PEOPLE_TAG_NAMESPACE,
};
use crate::notes::frontmatter::{line_ending, split_frontmatter};

/// Why a note was left unchanged; the frontend maps each reason to translated text.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SkipReason {
    UnsafeFrontmatter,
    TagOutsideEditableText,
    ChangedSincePreview,
    NotInPreview,
    Io,
}

/// A validated rename (`to: Some`) or delete (`to: None`) of a tag and its descendants.
pub(crate) struct TagRefactor {
    from: String,
    /// Target as the user typed it, without `#`; written into notes verbatim.
    to: Option<String>,
}

pub(crate) struct NoteRewrite {
    pub markdown: String,
    pub inline_count: usize,
    pub frontmatter_count: usize,
}

impl NoteRewrite {
    pub fn changed(&self) -> bool {
        self.inline_count + self.frontmatter_count > 0
    }
}

impl TagRefactor {
    pub fn new(from: &str, to: Option<&str>) -> Result<Self, String> {
        let from = normalize_tag(from).ok_or("invalid tag")?;
        let to = to.map(|to| to.trim().trim_start_matches('#').trim().to_string());
        let target = to
            .as_deref()
            .map(|to| normalize_tag(to).ok_or("invalid target tag"))
            .transpose()?;
        if [Some(&from), target.as_ref()]
            .into_iter()
            .flatten()
            .any(|tag| tag_matches_hierarchy(PEOPLE_TAG_NAMESPACE.trim_end_matches('/'), tag))
        {
            return Err("people tags cannot be refactored".to_string());
        }
        if target.as_ref() == Some(&from) {
            return Err("the target tag is the same as the source tag".to_string());
        }
        if target.is_some_and(|target| tag_matches_hierarchy(&from, target.as_str())) {
            return Err("a tag cannot be moved inside itself".to_string());
        }
        Ok(Self { from, to })
    }

    pub fn from(&self) -> &str {
        &self.from
    }

    /// Maps a written tag (without `#`): `None` when unaffected, `Some(None)` to delete it.
    pub fn map(&self, written: &str) -> Option<Option<String>> {
        let normalized = normalize_tag(written)?;
        if !tag_matches_hierarchy(&self.from, &normalized) {
            return None;
        }
        let Some(to) = &self.to else {
            return Some(None);
        };
        let depth = self.from.split('/').count();
        // Descendant segments keep the casing they were written with.
        let mut next = to.clone();
        for segment in written.trim().split('/').skip(depth) {
            next.push('/');
            next.push_str(segment);
        }
        Some(Some(next))
    }
}

pub(crate) fn rewrite_note(
    markdown: &str,
    refactor: &TagRefactor,
) -> Result<NoteRewrite, SkipReason> {
    let (bom, text) = match markdown.strip_prefix('\u{feff}') {
        Some(rest) => ("\u{feff}", rest),
        None => ("", markdown),
    };
    let (yaml, body) = split_frontmatter(text);
    let body_start = text.len() - body.len();
    let (body, inline_count) = inline::rewrite_inline(text, body_start, refactor);
    let mut head = text[..body_start].to_string();
    let mut frontmatter_count = 0;
    if let Some(yaml) = yaml {
        if let Some((next, count)) =
            frontmatter::rewrite_frontmatter_tags(yaml, refactor, line_ending(text))?
        {
            // `split_frontmatter` only matches YAML that starts right after the first line.
            let yaml_start = text.find('\n').map_or(0, |index| index + 1);
            head.replace_range(yaml_start..yaml_start + yaml.len(), &next);
            frontmatter_count = count;
        }
    }
    let rewritten = format!("{bom}{head}{body}");
    if parse_all_tags(&rewritten)
        .iter()
        .any(|tag| tag_matches_hierarchy(&refactor.from, tag))
    {
        return Err(SkipReason::TagOutsideEditableText);
    }
    Ok(NoteRewrite {
        markdown: rewritten,
        inline_count,
        frontmatter_count,
    })
}
