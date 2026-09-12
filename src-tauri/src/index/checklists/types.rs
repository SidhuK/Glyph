use super::metadata::TaskRepeat;
use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize)]
pub struct ParsedChecklistItem {
    pub checked: bool,
    pub start: usize,
    pub end: usize,
    pub checkbox_offset: usize,
    pub content_offset: usize,
    pub line: usize,
    pub task_index: usize,
    pub text: String,
    pub suffix: String,
    pub context: String,
    pub due: Option<String>,
    pub repeat: Option<TaskRepeat>,
}

#[derive(Serialize)]
pub struct InboxTask {
    pub note_path: String,
    pub note_title: String,
    pub etag: String,
    #[serde(flatten)]
    pub item: ParsedChecklistItem,
}

#[derive(Clone, Copy, Serialize)]
pub struct NoteTaskSummary {
    pub total_count: u32,
    pub completed_count: u32,
    pub open_count: u32,
}

#[derive(Serialize)]
pub struct NoteTaskSummaryItem {
    pub note_path: String,
    pub total_count: u32,
    pub completed_count: u32,
    pub open_count: u32,
}
