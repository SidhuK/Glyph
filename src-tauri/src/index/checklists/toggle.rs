use super::lines::markdown_lines;
use super::parse::{block_items, checklist_items_in};

pub(crate) const NOTE_CHANGED: &str = "conflict: note changed";
pub(crate) const TASK_ROLLED_OVER: &str = "conflict: task was rolled over";

/// Sets the status of the checklist item starting at `start`. Checking also
/// checks its nested child items; reopening touches only the target line.
/// Returns `None` when every affected status already matches.
pub(crate) fn toggle_checklist_item(
    markdown: &str,
    start: usize,
    checked: bool,
) -> Result<Option<String>, String> {
    let lines = markdown_lines(markdown);
    let items = checklist_items_in(&lines);
    let index = items
        .iter()
        .position(|item| item.start == start)
        .ok_or(NOTE_CHANGED)?;
    if items[index].moved {
        return Err(TASK_ROLLED_OVER.to_string());
    }
    let affected = if checked {
        block_items(&lines, &items, index)
    } else {
        &items[index..=index]
    };
    let status = if checked { "x" } else { " " };
    let mut next = markdown.to_string();
    let mut changed = false;
    for item in affected {
        let checkbox = item.checkbox..item.checkbox + 1;
        if !item.moved && (&markdown[checkbox.clone()] == " ") == checked {
            next.replace_range(checkbox, status);
            changed = true;
        }
    }
    Ok(changed.then_some(next))
}
