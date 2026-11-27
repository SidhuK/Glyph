use super::grammar::{atx_heading_level, parse_task_line};
use super::lines::{block_end, markdown_lines, MarkdownLine};
use super::types::{ParsedChecklistItem, TaskStatusKind};

pub(crate) fn checklist_items_in(lines: &[MarkdownLine<'_>]) -> Vec<ParsedChecklistItem> {
    let mut heading: Option<String> = None;
    let mut items = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        if !line.content {
            continue;
        }
        if let Some((_, text)) = atx_heading_level(line.text) {
            heading = (!text.is_empty()).then(|| text.to_string());
            continue;
        }
        let Some(task) = parse_task_line(line.text) else {
            continue;
        };
        items.push(ParsedChecklistItem {
            start: line.start,
            checkbox: line.start + task.status_offset,
            status: task.status,
            status_kind: TaskStatusKind::from_status(task.status),
            line_index: index,
            indent: task.indent,
            body_start: line.start + task.body_start,
            description_end: line.start + task.description_end,
            separated: task.separated,
            text: line.text[task.body_start..].trim().to_string(),
            moved: task.moved,
            heading: heading.clone(),
            parent: None,
        });
    }
    link_parents(lines, &mut items);
    items
}

fn link_parents(lines: &[MarkdownLine<'_>], items: &mut [ParsedChecklistItem]) {
    let mut open_blocks: Vec<(usize, usize)> = Vec::new();
    for index in 0..items.len() {
        while open_blocks
            .last()
            .is_some_and(|(_, end)| *end <= items[index].start)
        {
            open_blocks.pop();
        }
        if let Some(&(parent, _)) = open_blocks.last() {
            items[index].parent = Some(parent);
            items[index].moved |= items[parent].moved;
        }
        open_blocks.push((index, block_end(lines, items[index].line_index, usize::MAX)));
    }
}

pub(crate) fn parse_checklist_items(markdown: &str) -> Vec<ParsedChecklistItem> {
    checklist_items_in(&markdown_lines(markdown))
}

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

pub(crate) fn summarize_items(items: &[ParsedChecklistItem]) -> (u32, u32) {
    let counted = || {
        items
            .iter()
            .filter(|item| item.status_kind != TaskStatusKind::Cancelled)
    };
    let completed = counted()
        .filter(|item| item.status_kind == TaskStatusKind::Done)
        .count();
    (counted().count() as u32, completed as u32)
}
