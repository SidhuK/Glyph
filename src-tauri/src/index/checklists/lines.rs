use crate::notes::frontmatter::split_frontmatter;

#[derive(Clone, Copy)]
struct Fence {
    marker: char,
    length: usize,
}

/// One source line with the Markdown context checklist parsing needs.
pub(crate) struct MarkdownLine<'a> {
    pub start: usize,
    pub indent: usize,
    pub text: &'a str,
    pub blank: bool,
    /// Inside frontmatter, a fenced block, or an HTML comment (opener lines excluded).
    pub nested: bool,
    /// Ordinary Markdown: not frontmatter, a fence line, or a comment line.
    pub content: bool,
}

// Fences are recognised at any indentation: fences inside nested list items
// sit at 4+ spaces and their contents must never be read as tasks.
fn fence_marker(line: &str) -> Option<Fence> {
    let trimmed = line.trim_start();
    let marker = trimmed.chars().next()?;
    let length = trimmed.chars().take_while(|ch| *ch == marker).count();
    if !matches!(marker, '`' | '~') || length < 3 {
        return None;
    }
    Some(Fence { marker, length })
}

fn closes_fence(line: &str, fence: Fence) -> bool {
    let Some(candidate) = fence_marker(line) else {
        return false;
    };
    candidate.marker == fence.marker
        && candidate.length >= fence.length
        && line.trim_start()[candidate.length..].trim().is_empty()
}

pub(crate) fn markdown_lines(markdown: &str) -> Vec<MarkdownLine<'_>> {
    let (_, body) = split_frontmatter(markdown);
    let body_start = markdown.len() - body.len();
    let mut lines = Vec::new();
    let mut offset = 0usize;
    let mut fence = None;
    let mut in_comment = false;
    for segment in markdown.split_inclusive('\n') {
        let start = offset;
        offset += segment.len();
        let text = segment.strip_suffix('\n').unwrap_or(segment);
        let text = text.strip_suffix('\r').unwrap_or(text);
        let mut line = MarkdownLine {
            start,
            indent: text.len() - text.trim_start_matches([' ', '\t']).len(),
            text,
            blank: text.trim().is_empty(),
            nested: true,
            content: false,
        };
        if start < body_start {
            // Frontmatter stays nested and never counts as content.
        } else if let Some(open) = fence {
            if closes_fence(text, open) {
                fence = None;
            }
        } else if in_comment {
            in_comment = !text.contains("-->");
        } else if let Some(open) = fence_marker(text) {
            fence = Some(open);
            line.nested = false;
        } else if let Some(comment) = text.trim_start().strip_prefix("<!--") {
            // Only a line starting with `<!--` is a comment; a mid-line `<!--`
            // never opens a region.
            in_comment = !comment.contains("-->");
            line.nested = false;
        } else {
            line.nested = false;
            line.content = true;
        }
        lines.push(line);
    }
    lines
}

/// End of the block owned by the line at `index`: the start of the first later
/// non-blank, non-nested line indented no deeper than it, or `markdown_len`.
pub(crate) fn block_end(lines: &[MarkdownLine<'_>], index: usize, markdown_len: usize) -> usize {
    let indent = lines[index].indent;
    lines[index + 1..]
        .iter()
        .find(|line| !line.nested && !line.blank && line.indent <= indent)
        .map_or(markdown_len, |line| line.start)
}
