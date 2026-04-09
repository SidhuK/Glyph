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

#[derive(Clone, Serialize)]
pub struct LocalGraphNode {
    pub id: String,
    pub title: String,
    pub is_center: bool,
}

#[derive(Serialize)]
pub struct LocalGraphEdge {
    pub source: String,
    pub target: String,
}

#[derive(Serialize)]
pub struct LocalNoteGraph {
    pub center: LocalGraphNode,
    pub nodes: Vec<LocalGraphNode>,
    pub edges: Vec<LocalGraphEdge>,
}

#[derive(Serialize)]
pub struct TagCount {
    pub tag: String,
    pub direct_count: u32,
    pub total_count: u32,
    pub depth: u32,
    pub is_explicit: bool,
}

#[derive(Serialize)]
pub struct PersonCount {
    pub handle: String,
    pub count: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct TaskDateInfo {
    pub scheduled_date: String,
    pub due_date: String,
}
