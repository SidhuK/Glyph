use serde::Serialize;

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

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ViewNotePreview {
    pub id: String,
    pub title: String,
    pub content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct CalendarNoteDateProperty {
    pub key: String,
    pub kind: String,
    pub count: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct CalendarItem {
    pub id: String,
    pub kind: String,
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
