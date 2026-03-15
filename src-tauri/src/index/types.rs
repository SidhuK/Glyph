use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

#[derive(Serialize)]
pub struct IndexRebuildResult {
    pub indexed: usize,
}

#[derive(Serialize)]
pub struct BacklinkItem {
    pub id: String,
    pub title: String,
    pub updated: String,
}

#[derive(Serialize)]
pub struct TagCount {
    pub tag: String,
    pub count: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct TaskDateInfo {
    pub scheduled_date: String,
    pub due_date: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CalendarNoteDateKind {
    Date,
    #[serde(rename = "datetime")]
    DateTime,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CalendarItemKind {
    Note,
    DailyNote,
    Task,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct CalendarNoteDateProperty {
    pub key: String,
    pub kind: CalendarNoteDateKind,
    pub count: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct CalendarItem {
    pub id: String,
    pub kind: CalendarItemKind,
    pub date: String,
    pub title: String,
    pub rel_path: Option<String>,
    pub preview: Option<String>,
    pub badges: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct CalendarLoadResult {
    pub items: Vec<CalendarItem>,
    pub note_date_properties: Vec<CalendarNoteDateProperty>,
}
