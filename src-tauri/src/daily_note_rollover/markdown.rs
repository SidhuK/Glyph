use crate::index::checklists::{
    block_end, block_items, checklist_items_in, markdown_lines, parse_checklist_items, MarkdownLine,
    LEGACY_MOVED_FROM_MARKER_PREFIX, MOVED_FROM_MARKER_PREFIX, MOVED_TO_MARKER_PREFIX,
};
use crate::utils;

use super::types::RolloverCandidate;

fn marker_date<'a>(line: &'a str, prefix: &str) -> Option<&'a str> {
    let (_, value) = line.split_once(prefix)?;
    let date = value.split_once("]]")?.0;
    valid_date(date).then_some(date)
}

pub fn parse_candidates(
    source_path: &str,
    source_date: &str,
    markdown: &str,
    source_mtime_ms: u64,
) -> Vec<RolloverCandidate> {
    let lines = markdown_lines(markdown);
    let tasks = checklist_items_in(&lines);

    let mut candidates = Vec::new();
    let mut next_outer_start = 0usize;
    for (index, task) in tasks.iter().enumerate() {
        if task.start < next_outer_start {
            continue;
        }
        let end = block_end(&lines, task.line_index, markdown.len());
        next_outer_start = end;
        let descendants = &block_items(&lines, &tasks, index)[1..];
        let contains_unfinished = !task.checked || descendants.iter().any(|item| !item.checked);
        if task.moved || !contains_unfinished {
            continue;
        }
        let first_line = lines[task.line_index].text;
        let original_date = marker_date(first_line, MOVED_FROM_MARKER_PREFIX)
            .or_else(|| marker_date(first_line, LEGACY_MOVED_FROM_MARKER_PREFIX))
            .unwrap_or(source_date);
        let block = markdown[task.start..end].trim_end_matches('\n').to_string();
        let id = utils::sha256_hex(format!("{source_path}\0{}\0{block}", task.start).as_bytes());
        candidates.push(RolloverCandidate {
            id,
            source_path: source_path.to_string(),
            source_date: source_date.to_string(),
            original_date: original_date.to_string(),
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
    let items = parse_checklist_items(block);
    if items.is_empty() {
        return Err("rollover candidate is no longer a checkbox block".to_string());
    }
    let mut moved = block.to_string();
    for item in items {
        moved.replace_range(item.checkbox..item.checkbox + 1, "x");
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
    let lines = markdown_lines(markdown);
    if let Some(overdue_start) = heading_offset(&lines, "## Overdue") {
        let content_start = overdue_start + "## Overdue".len();
        let overdue_end = next_h2_offset(&lines, content_start).unwrap_or(markdown.len());
        if let Some(divider) = divider_offset(&lines, content_start, overdue_end) {
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

fn content_lines<'a, 'b>(
    lines: &'a [MarkdownLine<'b>],
) -> impl Iterator<Item = &'a MarkdownLine<'b>> {
    lines.iter().filter(|line| line.content)
}

fn heading_offset(lines: &[MarkdownLine<'_>], heading: &str) -> Option<usize> {
    content_lines(lines)
        .find(|line| line.text == heading)
        .map(|line| line.start)
}

fn next_h2_offset(lines: &[MarkdownLine<'_>], after: usize) -> Option<usize> {
    content_lines(lines)
        .find(|line| line.start >= after && line.text.starts_with("## "))
        .map(|line| line.start)
}

fn divider_offset(lines: &[MarkdownLine<'_>], after: usize, before: usize) -> Option<usize> {
    content_lines(lines)
        .find(|line| line.start >= after && line.start < before && line.text == "---")
        .map(|line| line.start)
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
