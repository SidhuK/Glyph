use crate::utils;

use super::types::RolloverCandidate;

const MOVED_TO_MARKER_PREFIX: &str = " ***Moved to*** [[";
const MOVED_FROM_MARKER_PREFIX: &str = " ***Moved from*** [[";
const LEGACY_MOVED_TO_MARKER_PREFIX: &str = " ***Moved to [[";
const LEGACY_MOVED_FROM_MARKER_PREFIX: &str = " ***Moved from [[";

struct TaskLine {
    start: usize,
    indent: usize,
    checked: bool,
    moved: bool,
    text: String,
    original_date: String,
}

struct MarkdownLine {
    start: usize,
    indent: usize,
    blank: bool,
    inside_fence: bool,
}

#[derive(Clone, Copy)]
struct Fence {
    marker: char,
    length: usize,
}

fn task_line(line: &str) -> Option<(usize, bool, bool, String, Option<String>)> {
    let indent = line
        .chars()
        .take_while(|ch| *ch == ' ' || *ch == '\t')
        .count();
    let rest = &line[indent..];
    let bytes = rest.as_bytes();
    if bytes.len() < 6
        || !matches!(bytes[0], b'-' | b'*' | b'+')
        || bytes[1] != b' '
        || bytes[2] != b'['
        || bytes[4] != b']'
        || bytes[5] != b' '
        || !matches!(bytes[3], b' ' | b'x' | b'X')
    {
        return None;
    }
    let marker_start = [
        MOVED_TO_MARKER_PREFIX,
        MOVED_FROM_MARKER_PREFIX,
        LEGACY_MOVED_TO_MARKER_PREFIX,
        LEGACY_MOVED_FROM_MARKER_PREFIX,
    ]
    .into_iter()
    .filter_map(|marker| rest.find(marker))
    .min()
    .unwrap_or(rest.len());
    let text = rest[6..marker_start].trim().to_string();
    let original_date = marker_date(rest, MOVED_FROM_MARKER_PREFIX)
        .or_else(|| marker_date(rest, LEGACY_MOVED_FROM_MARKER_PREFIX))
        .map(str::to_string);
    Some((
        indent,
        matches!(bytes[3], b'x' | b'X'),
        rest.contains(MOVED_TO_MARKER_PREFIX) || rest.contains(LEGACY_MOVED_TO_MARKER_PREFIX),
        text,
        original_date,
    ))
}

fn marker_date<'a>(line: &'a str, prefix: &str) -> Option<&'a str> {
    let (_, value) = line.split_once(prefix)?;
    let date = value.split_once("]]")?.0;
    valid_date(date).then_some(date)
}

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

pub fn parse_candidates(
    source_path: &str,
    source_date: &str,
    markdown: &str,
    source_mtime_ms: u64,
) -> Vec<RolloverCandidate> {
    let mut tasks = Vec::new();
    let mut lines = Vec::new();
    let mut offset = 0usize;
    let mut fence = None;

    for segment in markdown.split_inclusive('\n') {
        let without_newline = segment.strip_suffix('\n').unwrap_or(segment);
        let line = without_newline
            .strip_suffix('\r')
            .unwrap_or(without_newline);
        let indent = line
            .chars()
            .take_while(|ch| *ch == ' ' || *ch == '\t')
            .count();
        let inside_fence = fence.is_some();
        lines.push(MarkdownLine {
            start: offset,
            indent,
            blank: line.trim().is_empty(),
            inside_fence,
        });
        if let Some(open) = fence {
            if closes_fence(line, open) {
                fence = None;
            }
            offset += segment.len();
            continue;
        }
        if let Some(open) = fence_marker(line) {
            fence = Some(open);
            offset += segment.len();
            continue;
        }

        if let Some((indent, checked, moved, text, original_date)) = task_line(line) {
            tasks.push(TaskLine {
                start: offset,
                indent,
                checked,
                moved,
                text,
                original_date: original_date.unwrap_or_else(|| source_date.to_string()),
            });
        }
        offset += segment.len();
    }

    let mut candidates = Vec::new();
    let mut next_outer_start = 0usize;
    for (index, task) in tasks.iter().enumerate() {
        if task.start < next_outer_start {
            continue;
        }
        let first_line = lines
            .iter()
            .position(|line| line.start == task.start)
            .unwrap_or(0);
        let end = lines[first_line + 1..]
            .iter()
            .find(|line| !line.inside_fence && !line.blank && line.indent <= task.indent)
            .map(|line| line.start)
            .unwrap_or(markdown.len());
        next_outer_start = end;
        let descendants = tasks[index + 1..]
            .iter()
            .take_while(|next| next.start < end)
            .collect::<Vec<_>>();
        let contains_unfinished = !task.checked || descendants.iter().any(|item| !item.checked);
        if task.moved || !contains_unfinished {
            continue;
        }
        let block = markdown[task.start..end].trim_end_matches('\n').to_string();
        let id = utils::sha256_hex(format!("{source_path}\0{}\0{block}", task.start).as_bytes());
        candidates.push(RolloverCandidate {
            id,
            source_path: source_path.to_string(),
            source_date: source_date.to_string(),
            original_date: task.original_date.clone(),
            markdown: block,
            text: task.text.clone(),
            nested_count: descendants.len() as u32,
            unfinished_nested_count: descendants.iter().filter(|item| !item.checked).count() as u32,
            start: task.start,
            end,
            source_mtime_ms,
        });
    }
    candidates
}

pub fn mark_moved(block: &str, destination_date: &str) -> Result<String, String> {
    let mut moved = block.to_string();
    let mut checkbox_offsets = Vec::new();
    let mut offset = 0usize;
    let mut fence = None;
    for segment in block.split_inclusive('\n') {
        let line = segment.strip_suffix('\n').unwrap_or(segment);
        let line = line.strip_suffix('\r').unwrap_or(line);
        if let Some(open) = fence {
            if closes_fence(line, open) {
                fence = None;
            }
        } else if let Some(open) = fence_marker(line) {
            fence = Some(open);
        } else if let Some((indent, _, _, _, _)) = task_line(line) {
            checkbox_offsets.push(offset + indent + 3);
        }
        offset += segment.len();
    }
    if checkbox_offsets.is_empty() {
        return Err("rollover candidate is no longer a checkbox block".to_string());
    }
    for checkbox_offset in checkbox_offsets {
        moved.replace_range(checkbox_offset..checkbox_offset + 1, "x");
    }
    let first_line_end = moved.find('\n').unwrap_or(moved.len());
    moved.insert_str(
        first_line_end,
        &format!("{MOVED_TO_MARKER_PREFIX}{destination_date}]]"),
    );
    Ok(moved)
}

pub fn insert_overdue_blocks(markdown: &str, groups: &[(String, Vec<String>)]) -> String {
    let mut next = markdown.to_string();
    for (original_date, blocks) in groups {
        next = insert_group(&next, original_date, blocks);
    }
    next
}

fn insert_group(markdown: &str, original_date: &str, blocks: &[String]) -> String {
    let block_text = blocks
        .iter()
        .map(|block| mark_moved_from(block, original_date))
        .collect::<Vec<_>>()
        .join("\n\n");
    if let Some(overdue_start) = heading_offset(markdown, "## Overdue") {
        let content_start = overdue_start + "## Overdue".len();
        let overdue_end = next_h2_offset(markdown, content_start);
        if let Some(divider) = divider_offset(markdown, content_start, overdue_end) {
            return insert_at(markdown, divider, &format!("\n\n{block_text}"));
        }
        return insert_at(markdown, overdue_end, &format!("\n\n{block_text}\n\n---"));
    }

    let insertion = top_insertion_offset(markdown);
    insert_at(
        markdown,
        insertion,
        &format!("\n\n## Overdue\n\n{block_text}\n\n---"),
    )
}

fn mark_moved_from(block: &str, original_date: &str) -> String {
    let first_line_end = block.find('\n').unwrap_or(block.len());
    if block[..first_line_end].contains(MOVED_FROM_MARKER_PREFIX) {
        return block.to_string();
    }
    if let Some(legacy_date) =
        marker_date(&block[..first_line_end], LEGACY_MOVED_FROM_MARKER_PREFIX)
    {
        return block.replacen(
            &format!("{LEGACY_MOVED_FROM_MARKER_PREFIX}{legacy_date}]]***"),
            &format!("{MOVED_FROM_MARKER_PREFIX}{legacy_date}]]"),
            1,
        );
    }
    let mut marked = block.to_string();
    marked.insert_str(
        first_line_end,
        &format!("{MOVED_FROM_MARKER_PREFIX}{original_date}]]"),
    );
    marked
}

fn heading_offset(markdown: &str, heading: &str) -> Option<usize> {
    lines_outside_fences(markdown)
        .find(|(_, line)| *line == heading)
        .map(|(offset, _)| offset)
}

fn next_h2_offset(markdown: &str, after: usize) -> usize {
    lines_outside_fences(markdown)
        .find(|(offset, line)| *offset >= after && line.starts_with("## "))
        .map(|(offset, _)| offset)
        .unwrap_or(markdown.len())
}

fn divider_offset(markdown: &str, after: usize, before: usize) -> Option<usize> {
    lines_outside_fences(markdown)
        .find(|(offset, line)| *offset >= after && *offset < before && *line == "---")
        .map(|(offset, _)| offset)
}

fn lines_outside_fences(markdown: &str) -> impl Iterator<Item = (usize, &str)> {
    let mut offset = 0usize;
    let mut fence = None;
    markdown.split_inclusive('\n').filter_map(move |segment| {
        let start = offset;
        offset += segment.len();
        let without_newline = segment.strip_suffix('\n').unwrap_or(segment);
        let line = without_newline.strip_suffix('\r').unwrap_or(without_newline);
        if let Some(open) = fence {
            if closes_fence(line, open) {
                fence = None;
            }
            return None;
        }
        if let Some(open) = fence_marker(line) {
            fence = Some(open);
            return None;
        }
        Some((start, line))
    })
}

fn top_insertion_offset(markdown: &str) -> usize {
    let mut offset = 0usize;
    let mut lines = markdown.split_inclusive('\n');
    if let Some(first) = lines
        .next()
        .filter(|line| line.trim_end_matches(['\r', '\n']) == "---")
    {
        let mut scanned = first.len();
        for line in lines {
            scanned += line.len();
            if line.trim_end_matches(['\r', '\n']) == "---" {
                offset = scanned;
                break;
            }
        }
    }
    let tail = &markdown[offset..];
    let trimmed = tail.trim_start_matches(['\r', '\n']);
    let whitespace = tail.len() - trimmed.len();
    if trimmed.starts_with("# ") {
        let heading_start = offset + whitespace;
        return markdown[heading_start..]
            .find('\n')
            .map(|end| heading_start + end)
            .unwrap_or(markdown.len());
    }
    offset
}

fn insert_at(markdown: &str, offset: usize, addition: &str) -> String {
    let mut next = String::with_capacity(markdown.len() + addition.len() + 1);
    next.push_str(markdown[..offset].trim_end());
    next.push_str(addition);
    next.push('\n');
    let tail = markdown[offset..].trim_start_matches(['\r', '\n']);
    if !tail.is_empty() {
        next.push('\n');
        next.push_str(tail);
    }
    next
}

pub fn valid_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| matches!(index, 4 | 7) || byte.is_ascii_digit())
        && chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}
