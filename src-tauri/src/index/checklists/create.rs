use super::fields::priority_name;
use super::grammar::{atx_heading_level, is_list_item};
use super::lines::{markdown_lines, MarkdownLine};

const TASKS_SECTION: &str = "tasks";
const TASKS_SECTION_LEVEL: usize = 2;

pub(crate) fn canonical_task_line(title: &str, priority: Option<u8>, due: Option<&str>) -> String {
    let mut line = format!("- [ ] {}", title.trim());
    if let Some(name) = priority.and_then(priority_name) {
        line.push_str(&format!("  [priority:: {name}]"));
    }
    if let Some(due) = due {
        line.push_str(&format!("  [due:: {due}]"));
    }
    line
}

fn heading_level<'a>(line: &MarkdownLine<'a>) -> Option<(usize, &'a str)> {
    line.content.then(|| atx_heading_level(line.text)).flatten()
}

fn tasks_section(lines: &[MarkdownLine<'_>]) -> Option<(usize, usize)> {
    let heading = lines.iter().position(|line| {
        heading_level(line).is_some_and(|(level, text)| {
            level == TASKS_SECTION_LEVEL && text.eq_ignore_ascii_case(TASKS_SECTION)
        })
    })?;
    let end = lines[heading + 1..]
        .iter()
        .position(|line| heading_level(line).is_some_and(|(level, _)| level <= TASKS_SECTION_LEVEL))
        .map_or(lines.len(), |offset| heading + 1 + offset);
    Some((heading, end))
}

pub(crate) fn insert_task_line(markdown: &str, task_line: &str) -> (String, usize) {
    let newline = if markdown.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let lines = markdown_lines(markdown);
    let (first, end) = tasks_section(&lines).unwrap_or((0, lines.len()));
    let anchor = lines[first..end].iter().rev().find(|line| !line.blank);
    let Some(anchor) = anchor else {
        return (format!("{task_line}{newline}"), 0);
    };
    let offset = anchor.start + anchor.text.len();
    let tight = heading_level(anchor).is_some() || (anchor.content && is_list_item(anchor.text));
    let separator = if tight {
        newline.to_string()
    } else {
        newline.repeat(2)
    };
    let rest = &markdown[offset..];
    let tail = if rest.is_empty() { newline } else { "" };
    let next = format!("{}{separator}{task_line}{tail}{rest}", &markdown[..offset]);
    (next, offset + separator.len())
}
