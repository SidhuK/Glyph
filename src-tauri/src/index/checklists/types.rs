use serde::{Deserialize, Serialize};

#[derive(Clone, Debug)]
pub struct ParsedChecklistItem {
    pub checked: bool,
    /// Byte offset of the line start.
    pub start: usize,
    /// Byte offset of the status character inside `[ ]`.
    pub checkbox: usize,
    /// 0-based index into the note's lines.
    pub line_index: usize,
    /// Bytes of leading spaces/tabs.
    pub indent: usize,
    pub text: String,
    /// The line carries a rollover "Moved to" marker.
    pub moved: bool,
    /// Nearest ATX heading above the item.
    pub heading: Option<String>,
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

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TaskScope {
    All,
    Folder { folder_prefix: String },
    Tag { tag: String },
}

#[derive(Debug, Serialize)]
pub struct TaskItem {
    pub start: usize,
    pub indent: usize,
    pub text: String,
    pub heading: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TaskNoteGroup {
    pub note_path: String,
    pub title: String,
    pub etag: String,
    pub total_count: u32,
    pub items: Vec<TaskItem>,
}

#[derive(Debug, Deserialize)]
pub struct TaskToggleRequest {
    pub space_path: String,
    pub note_path: String,
    pub etag: String,
    pub checked: bool,
    pub items: Vec<TaskToggleTarget>,
}

/// A task to toggle, identified by its line offset and parsed text.
#[derive(Debug, Deserialize)]
pub struct TaskToggleTarget {
    pub start: usize,
    pub text: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TaskToggleOutcome {
    Saved { etag: String },
    IndexFailed { etag: String },
}
