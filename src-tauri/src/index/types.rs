use serde::Serialize;

#[derive(Serialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

#[derive(Serialize)]
pub struct IndexNotePreview {
    pub id: String,
    pub title: String,
    pub preview: String,
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
