use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Recurrence {
    Daily,
    Weekly,
    Monthly,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Schedule {
    Unscheduled {
        reminder: Option<String>,
    },
    Dated {
        due: String,
        recurrence: Option<Recurrence>,
        reminder: Option<String>,
    },
}

impl Schedule {
    pub fn reminder(&self) -> Option<&str> {
        match self {
            Self::Unscheduled { reminder } | Self::Dated { reminder, .. } => reminder.as_deref(),
        }
    }
}

#[derive(Serialize)]
pub struct InboxTask {
    pub note_path: String,
    pub etag: String,
    pub start: usize,
    pub line: usize,
    pub text: String,
    pub checked: bool,
    pub schedule: Schedule,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum TaskEdit {
    Complete { checked: bool },
    Schedule { schedule: Schedule },
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaskUpdateRequest {
    pub space_path: String,
    pub note_path: String,
    pub etag: String,
    pub start: usize,
    pub editor_markdown: Option<String>,
    pub edit: TaskEdit,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TaskWriteOutcome {
    Saved,
    IndexFailed,
}
