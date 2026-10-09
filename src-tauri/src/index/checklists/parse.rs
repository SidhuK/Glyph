use super::lines::{block_end, markdown_lines, MarkdownLine};
use super::types::{NoteTaskSummary, ParsedChecklistItem};

pub(crate) const MOVED_TO_MARKER_PREFIX: &str = " ***Moved to*** [[";
pub(crate) const MOVED_FROM_MARKER_PREFIX: &str = " ***Moved from*** [[";
pub(crate) const LEGACY_MOVED_TO_MARKER_PREFIX: &str = " ***Moved to [[";
pub(crate) const LEGACY_MOVED_FROM_MARKER_PREFIX: &str = " ***Moved from [[";

/// Byte length of the checkbox prefix (`- [ ] ` / `- [x] `) after indent.
const CHECKBOX_PREFIX_LEN: usize = 6;

struct ChecklistLine<'a> {
    indent: usize,
    checked: bool,
    moved: bool,
    text: &'a str,
}

fn parse_checklist_line(line: &str) -> Option<ChecklistLine<'_>> {
    let indent = line.len() - line.trim_start_matches([' ', '\t']).len();
    let rest = &line[indent..];
    let bytes = rest.as_bytes();
    if bytes.len() < CHECKBOX_PREFIX_LEN
        || !matches!(bytes[0], b'-' | b'*' | b'+')
        || bytes[1] != b' '
        || bytes[2] != b'['
        || bytes[4] != b']'
        || bytes[5] != b' '
        || !matches!(bytes[3], b' ' | b'x' | b'X')
    {
        return None;
    }
    // Markers start with a space that, for an empty task, is the required space
    // after `]`; clamp so the text slice never starts past its end.
    let marker_start = [
        MOVED_TO_MARKER_PREFIX,
        MOVED_FROM_MARKER_PREFIX,
        LEGACY_MOVED_TO_MARKER_PREFIX,
        LEGACY_MOVED_FROM_MARKER_PREFIX,
    ]
    .into_iter()
    .filter_map(|marker| rest.find(marker))
    .min()
    .unwrap_or(rest.len())
    .max(CHECKBOX_PREFIX_LEN);
    Some(ChecklistLine {
        indent,
        checked: matches!(bytes[3], b'x' | b'X'),
        moved: rest.contains(MOVED_TO_MARKER_PREFIX)
            || rest.contains(LEGACY_MOVED_TO_MARKER_PREFIX),
        text: rest[CHECKBOX_PREFIX_LEN..marker_start].trim(),
    })
}

/// Text of an ATX heading (`#`..`######` then a space), without closing hashes.
fn atx_heading(line: &str) -> Option<&str> {
    let rest = line.trim_start_matches(' ');
    if line.len() - rest.len() > 3 {
        return None;
    }
    let hashes = rest.len() - rest.trim_start_matches('#').len();
    if !(1..=6).contains(&hashes) {
        return None;
    }
    let body = rest[hashes..].strip_prefix([' ', '\t'])?.trim();
    let open = body.trim_end_matches('#');
    if open.is_empty() || open.ends_with([' ', '\t']) {
        return Some(open.trim());
    }
    Some(body)
}

pub(crate) fn checklist_items_in(lines: &[MarkdownLine<'_>]) -> Vec<ParsedChecklistItem> {
    let mut heading: Option<String> = None;
    let mut items = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        if !line.content {
            continue;
        }
        if let Some(text) = atx_heading(line.text) {
            heading = (!text.is_empty()).then(|| text.to_string());
            continue;
        }
        let Some(item) = parse_checklist_line(line.text) else {
            continue;
        };
        items.push(ParsedChecklistItem {
            checked: item.checked,
            start: line.start,
            checkbox: line.start + item.indent + 3,
            line_index: index,
            indent: item.indent,
            text: item.text.to_string(),
            moved: item.moved,
            heading: heading.clone(),
        });
    }
    items
}

pub(crate) fn parse_checklist_items(markdown: &str) -> Vec<ParsedChecklistItem> {
    checklist_items_in(&markdown_lines(markdown))
}

/// The item at `index` followed by its nested child items.
pub(crate) fn block_items<'a>(
    lines: &[MarkdownLine<'_>],
    items: &'a [ParsedChecklistItem],
    index: usize,
) -> &'a [ParsedChecklistItem] {
    let end = block_end(lines, items[index].line_index, usize::MAX);
    let count = items[index..]
        .iter()
        .take_while(|item| item.start < end)
        .count();
    &items[index..index + count]
}

pub(crate) fn summarize_items(items: &[ParsedChecklistItem]) -> NoteTaskSummary {
    let total_count = items.len() as u32;
    let completed_count = items.iter().filter(|item| item.checked).count() as u32;
    NoteTaskSummary {
        total_count,
        completed_count,
        open_count: total_count.saturating_sub(completed_count),
    }
}

pub(crate) fn summarize_tasks(markdown: &str) -> NoteTaskSummary {
    summarize_items(&parse_checklist_items(markdown))
}
