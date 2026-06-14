use super::types::{NoteTaskSummary, ParsedChecklistItem};

struct ChecklistLineMatch {
    checked: bool,
}

fn parse_checklist_line(line: &str) -> Option<ChecklistLineMatch> {
    let mut ws = 0usize;
    for ch in line.chars() {
        if ch == ' ' || ch == '\t' {
            ws += ch.len_utf8();
        } else {
            break;
        }
    }
    let rest = &line[ws..];
    let bytes = rest.as_bytes();
    if bytes.len() < 6 {
        return None;
    }
    let marker = bytes[0] as char;
    if marker != '-' && marker != '*' && marker != '+' {
        return None;
    }
    if bytes[1] != b' ' || bytes[2] != b'[' || bytes[4] != b']' || bytes[5] != b' ' {
        return None;
    }
    let status = bytes[3] as char;
    if status != ' ' && status != 'x' && status != 'X' {
        return None;
    }
    Some(ChecklistLineMatch {
        checked: status == 'x' || status == 'X',
    })
}

pub fn parse_checklist_items(markdown: &str) -> Vec<ParsedChecklistItem> {
    markdown
        .lines()
        .filter_map(|line| {
            parse_checklist_line(line).map(|m| ParsedChecklistItem {
                checked: m.checked,
            })
        })
        .collect()
}

pub fn summarize_tasks(markdown: &str) -> NoteTaskSummary {
    let mut total_count = 0u32;
    let mut completed_count = 0u32;

    for item in parse_checklist_items(markdown) {
        total_count += 1;
        if item.checked {
            completed_count += 1;
        }
    }

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