use serde::Serialize;

#[derive(Clone, Copy)]
pub enum TaskBucket {
    Inbox,
    Today,
    Upcoming,
}

impl TaskBucket {
    pub fn parse(raw: &str) -> Result<Self, String> {
        match raw.trim().to_lowercase().as_str() {
            "inbox" => Ok(Self::Inbox),
            "today" => Ok(Self::Today),
            "upcoming" => Ok(Self::Upcoming),
            _ => Err("invalid task bucket".to_string()),
        }
    }
}

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
