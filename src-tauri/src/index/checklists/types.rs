use std::ops::Range;

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatusKind {
    Todo,
    InProgress,
    Done,
    Cancelled,
}

impl TaskStatusKind {
    pub fn from_status(status: char) -> Self {
        match status {
            'x' | 'X' => Self::Done,
            '/' => Self::InProgress,
            '-' => Self::Cancelled,
            _ => Self::Todo,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Todo => "todo",
            Self::InProgress => "in_progress",
            Self::Done => "done",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn is_open(self) -> bool {
        matches!(self, Self::Todo | Self::InProgress)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskFieldKey {
    Priority,
    Due,
    Completion,
    Cancelled,
}

impl TaskFieldKey {
    pub const ALL: [Self; 4] = [Self::Priority, Self::Due, Self::Completion, Self::Cancelled];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Priority => "priority",
            Self::Due => "due",
            Self::Completion => "completion",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn from_key(key: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|candidate| candidate.as_str() == key)
    }
}

#[derive(Clone, Debug)]
pub struct ParsedChecklistItem {
    pub start: usize,
    pub checkbox: usize,
    pub status: char,
    pub status_kind: TaskStatusKind,
    pub line_index: usize,
    pub indent: usize,
    pub body_start: usize,
    pub description_end: usize,
    pub separated: bool,
    pub text: String,
    pub moved: bool,
    pub heading: Option<String>,
    pub parent: Option<usize>,
}

impl ParsedChecklistItem {
    pub fn status_range(&self) -> Range<usize> {
        self.checkbox..self.checkbox + self.status.len_utf8()
    }

    pub fn description(&self) -> Range<usize> {
        self.body_start..self.description_end
    }

    pub fn is_open(&self) -> bool {
        self.status_kind.is_open()
    }
}

#[derive(Serialize)]
pub struct NoteTaskSummaryItem {
    pub note_path: String,
    pub total_count: u32,
    pub completed_count: u32,
    pub open_count: u32,
}
