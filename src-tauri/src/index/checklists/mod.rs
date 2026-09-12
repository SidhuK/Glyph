pub mod commands;
mod metadata;
mod parse;
mod store;
mod types;

pub use parse::summarize_tasks;
pub(crate) use store::index_checklist;
pub use store::query_note_checklist_summaries;
pub use types::{NoteTaskSummary, NoteTaskSummaryItem};

pub fn checklist_counts(markdown: &str) -> (u32, u32) {
    let summary = summarize_tasks(markdown);
    (summary.total_count, summary.completed_count)
}

/// Expand completed repeating tasks as part of the editor's normal save.
/// Processing from the bottom preserves the offsets of earlier checkboxes.
pub(crate) fn advance_completed_repeats(markdown: &str) -> Result<Option<String>, String> {
    let starts: Vec<usize> = parse::parse_checklist_items(markdown)
        .into_iter()
        .filter(|task| task.checked && task.repeat.is_some() && task.due.is_some())
        .map(|task| task.start)
        .collect();
    if starts.is_empty() {
        return Ok(None);
    }
    let mut next = markdown.to_string();
    for start in starts.into_iter().rev() {
        next = commands::rewrite_task(
            &next,
            commands::TaskAction::Check {
                start,
                checked: true,
            },
        )?
        .0;
    }
    Ok(Some(next))
}
