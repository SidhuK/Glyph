use serde::Serialize;

pub struct ParsedChecklistItem<'a> {
    pub checked: bool,
    pub start: usize,
    pub end: usize,
    pub checkbox: usize,
    pub line: usize,
    pub text: &'a str,
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
