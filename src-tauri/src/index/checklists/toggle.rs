use super::lines::markdown_lines;
use super::parse::{block_items, checklist_items_in};
use super::types::TaskToggleTarget;

pub(crate) const NOTE_CHANGED: &str = "conflict: note changed";
pub(crate) const TASK_ROLLED_OVER: &str = "conflict: task was rolled over";

/// Sets the status of every target in one rewrite. A target must match a
/// parsed item by both offset and text. Checking also checks each target's
/// nested child items (moved ones excepted); reopening touches only targets.
/// Returns `None` when every affected status already matches.
pub(crate) fn toggle_checklist_items(
    markdown: &str,
    targets: &[TaskToggleTarget],
    checked: bool,
) -> Result<Option<String>, String> {
    let lines = markdown_lines(markdown);
    let items = checklist_items_in(&lines);
    let mut affected = vec![false; items.len()];
    for target in targets {
        let index = items
            .iter()
            .position(|item| item.start == target.start && item.text == target.text)
            .ok_or(NOTE_CHANGED)?;
        if items[index].moved {
            return Err(TASK_ROLLED_OVER.to_string());
        }
        let count = if checked {
            block_items(&lines, &items, index).len()
        } else {
            1
        };
        affected[index..index + count].fill(true);
    }
    let status = if checked { "x" } else { " " };
    let mut next = markdown.to_string();
    let mut changed = false;
    for (item, _) in items.iter().zip(&affected).filter(|(_, hit)| **hit) {
        let checkbox = item.checkbox..item.checkbox + 1;
        if !item.moved && (&markdown[checkbox.clone()] == " ") == checked {
            next.replace_range(checkbox, status);
            changed = true;
        }
    }
    Ok(changed.then_some(next))
}
