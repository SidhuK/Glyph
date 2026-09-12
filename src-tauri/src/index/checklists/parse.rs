use super::{
    metadata::split_metadata,
    types::{NoteTaskSummary, ParsedChecklistItem},
};
use regex::Regex;
use std::sync::OnceLock;

pub fn parse_checklist_items(markdown: &str) -> Vec<ParsedChecklistItem> {
    static TASK: OnceLock<Regex> = OnceLock::new();
    let task_pattern = TASK.get_or_init(|| {
        Regex::new(r"^(?:[ \t]*>[ \t]?)*[ \t]*(?:[-+*]|[0-9]+[.)])[ \t]+\[([ xX])\](?:[ \t]+|$)")
            .expect("task pattern")
    });
    let mut out = Vec::new();
    let mut offset = 0;
    let mut fence: Option<(char, usize)> = None;
    let mut frontmatter = false;
    let mut comment = false;
    let mut context = String::new();
    let mut list_indent: Option<usize> = None;
    let mut task_index = 0;
    let mut moved_indent: Option<usize> = None;
    for (index, segment) in markdown.split_inclusive('\n').enumerate() {
        let start = offset;
        offset += segment.len();
        let line = segment.trim_end_matches(['\r', '\n']);
        let trimmed = line.trim_start_matches('\u{feff}').trim_start();
        if index == 0
            && trimmed == "---"
            && markdown
                .lines()
                .skip(1)
                .any(|line| matches!(line.trim(), "---" | "..."))
        {
            frontmatter = true;
            continue;
        }
        if frontmatter {
            if matches!(trimmed, "---" | "...") {
                frontmatter = false;
            }
            continue;
        }
        if comment {
            if trimmed.contains("-->") {
                comment = false;
            }
            continue;
        }
        if trimmed.starts_with("<!--") {
            comment = !trimmed.contains("-->");
            continue;
        }
        let mut quoted = trimmed;
        while let Some(rest) = quoted.strip_prefix('>') {
            quoted = rest.trim_start();
        }
        let marker = quoted.chars().next().unwrap_or(' ');
        let count = quoted.chars().take_while(|ch| *ch == marker).count();
        if let Some((open, length)) = fence {
            if marker == open && count >= length && quoted[count..].trim().is_empty() {
                fence = None;
            }
            continue;
        }
        if matches!(marker, '`' | '~') && count >= 3 {
            fence = Some((marker, count));
            continue;
        }
        let indent = line
            .chars()
            .take_while(|c| *c == ' ' || *c == '\t')
            .map(|c| if c == '\t' { 4 } else { 1 })
            .sum::<usize>();
        if !trimmed.is_empty() && list_indent.is_some_and(|parent| indent <= parent) {
            list_indent = None;
        }
        if !trimmed.is_empty() && moved_indent.is_some_and(|parent| indent <= parent) {
            moved_indent = None;
        }
        if indent >= 4 && list_indent.is_none() {
            continue;
        }
        if let Some(heading) = trimmed.strip_prefix('#') {
            let heading = heading.trim_start_matches('#');
            if heading.starts_with(' ') {
                context = heading.trim().trim_end_matches('#').trim().to_string();
            }
        }
        if let Some(captures) = task_pattern.captures(line) {
            let prefix = captures.get(0).expect("matched prefix");
            let status = captures.get(1).expect("matched checkbox");
            list_indent = Some(list_indent.map_or(indent, |parent| parent.min(indent)));
            // Rollover leaves a checked marker in the old note. It isn't a second task.
            let content = &line[prefix.end()..];
            let ordinal = task_index;
            task_index += 1;
            if content.contains("***Moved to*** [[") || content.contains("***Moved to [[") {
                moved_indent = Some(indent);
                continue;
            }
            if moved_indent.is_some() {
                continue;
            }
            let suffix_start = [" ***Moved from*** [[", " ***Moved from [["]
                .into_iter()
                .filter_map(|marker| content.find(marker))
                .min()
                .unwrap_or(content.trim_end().len());
            let suffix = content[suffix_start..].to_string();
            let (text, due, repeat) = split_metadata(&content[..suffix_start]);
            out.push(ParsedChecklistItem {
                checked: status.as_str() != " ",
                start,
                end: start + line.len(),
                checkbox_offset: start + status.start(),
                content_offset: start + prefix.end(),
                line: index + 1,
                task_index: ordinal,
                text,
                suffix,
                context: context.clone(),
                due,
                repeat,
            });
        } else if trimmed.starts_with("- ")
            || trimmed.starts_with("* ")
            || trimmed.starts_with("+ ")
        {
            list_indent = Some(list_indent.map_or(indent, |parent| parent.min(indent)));
        }
    }
    out
}

pub fn summarize_tasks(markdown: &str) -> NoteTaskSummary {
    let items = parse_checklist_items(markdown);
    let total_count = items.len() as u32;
    let completed_count = items.iter().filter(|item| item.checked).count() as u32;
    NoteTaskSummary {
        total_count,
        completed_count,
        open_count: total_count.saturating_sub(completed_count),
    }
}

#[cfg(test)]
mod tests {
    use super::summarize_tasks;

    #[test]
    fn summarize_tasks_counts_nested_and_checked_items() {
        let markdown = r#"# Tasks

- [ ] Parent task
  - [x] Child done
  - [ ] Child open
- [X] Finished top level

Not a task line
"#;

        let summary = summarize_tasks(markdown);
        assert_eq!(summary.total_count, 4);
        assert_eq!(summary.completed_count, 2);
        assert_eq!(summary.open_count, 2);
    }

    #[test]
    fn summarize_tasks_returns_zeroes_when_no_tasks_exist() {
        let summary = summarize_tasks("# Note\n\nJust text.\n");
        assert_eq!(summary.total_count, 0);
        assert_eq!(summary.completed_count, 0);
        assert_eq!(summary.open_count, 0);
    }
}
