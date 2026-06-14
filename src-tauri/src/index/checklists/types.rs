use serde::Serialize;

#[derive(Clone)]
pub struct ParsedChecklistItem {
    pub checked: bool,
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