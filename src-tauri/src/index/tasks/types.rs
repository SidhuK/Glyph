use serde::Serialize;

#[derive(Clone)]
pub struct ParsedTask {
    pub line_start: i64,
    pub list_path: String,
    pub indent: i64,
    pub raw_text: String,
    pub text_norm: String,
    pub checked: bool,
    pub status: String,
    pub due_date: Option<String>,
    pub scheduled_date: Option<String>,
    pub tags: Vec<String>,
    pub section: Option<String>,
}

#[derive(Serialize)]
pub struct IndexedTask {
    pub task_id: String,
    pub note_id: String,
    pub note_title: String,
    pub note_path: String,
    pub line_start: i64,
    pub raw_text: String,
    pub checked: bool,
    pub status: String,
    pub priority: i64,
    pub due_date: Option<String>,
    pub scheduled_date: Option<String>,
    pub section: Option<String>,
    pub note_updated: String,
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
