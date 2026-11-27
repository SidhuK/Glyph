use serde::{Deserialize, Deserializer, Serialize};

use super::types::{TaskFieldKey, TaskStatusKind};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskView {
    Today,
    Upcoming,
    All,
    Done,
}

#[derive(Debug, Default, Deserialize)]
pub struct TaskQueryFilters {
    pub note_paths: Vec<String>,
    pub folder_prefixes: Vec<String>,
    pub tags: Vec<String>,
    pub statuses: Vec<TaskStatusKind>,
    pub priorities: Vec<u8>,
    pub include_no_priority: bool,
    pub due_before: Option<String>,
    pub due_after: Option<String>,
    pub due_none: bool,
    pub include_done: bool,
}

#[derive(Debug, Deserialize)]
pub struct TaskQueryRequest {
    pub space_path: String,
    pub view: TaskView,
    pub filters: TaskQueryFilters,
    pub today: String,
}

#[derive(Debug, PartialEq, Serialize)]
pub struct TaskRecord {
    pub note_path: String,
    pub note_title: String,
    pub note_etag: String,
    pub note_updated_ms: i64,
    pub start: usize,
    pub indent: usize,
    pub status: String,
    pub status_kind: TaskStatusKind,
    pub text: String,
    pub title: String,
    pub heading: Option<String>,
    pub due: Option<String>,
    pub priority: Option<u8>,
    pub completion: Option<String>,
    pub cancelled: Option<String>,
    pub tags: Vec<String>,
    pub invalid: Vec<TaskFieldKey>,
    pub parent_start: Option<usize>,
    pub subtask_total: u32,
    pub subtask_done: u32,
}

fn present<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

#[derive(Debug, Default, Deserialize)]
pub struct TaskFieldEdits {
    #[serde(default, deserialize_with = "present")]
    pub due: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    pub priority: Option<Option<u8>>,
    #[serde(default, deserialize_with = "present")]
    pub completion: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    pub cancelled: Option<Option<String>>,
}

#[derive(Debug, Deserialize)]
pub struct TaskEdit {
    pub note_path: String,
    pub etag: String,
    pub start: usize,
    pub text: String,
    pub set_status: Option<String>,
    pub set_fields: Option<TaskFieldEdits>,
    pub set_title: Option<String>,
    #[serde(default)]
    pub skip_subtasks: bool,
}

#[derive(Debug, Deserialize)]
pub struct TaskUpdateBatchRequest {
    pub space_path: String,
    pub today: String,
    pub edits: Vec<TaskEdit>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TaskWriteOutcome {
    Saved { etag: String },
    IndexFailed { etag: String },
    Conflict,
    Failed { message: String },
}

#[derive(Debug, PartialEq, Serialize)]
pub struct TaskNoteWriteResult {
    pub note_path: String,
    pub outcome: TaskWriteOutcome,
}

#[derive(Debug, Deserialize)]
pub struct TaskCreateRequest {
    pub space_path: String,
    pub note_path: String,
    pub title: String,
    pub due: Option<String>,
    pub priority: Option<u8>,
}

#[derive(Debug, PartialEq, Serialize)]
pub struct TaskCreateResult {
    pub note_path: String,
    pub start: usize,
    pub outcome: TaskWriteOutcome,
}
