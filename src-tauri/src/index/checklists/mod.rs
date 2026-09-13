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
