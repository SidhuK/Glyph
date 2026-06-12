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

#[derive(Clone, Serialize)]
pub struct LocalConnectionsNode {
    pub id: String,
    pub title: String,
    pub is_center: bool,
}

#[derive(Serialize)]
pub struct LocalConnectionsEdge {
    pub source: String,
    pub target: String,
}

#[derive(Clone, Serialize)]
pub struct LocalConnectionsTagNode {
    pub id: String,
    pub tag: String,
    pub title: String,
    pub note_count: u32,
}

#[derive(Serialize)]
pub struct LocalConnectionsTagEdge {
    pub tag_id: String,
    pub note_id: String,
}

#[derive(Serialize)]
pub struct LocalNoteConnections {
    pub center: LocalConnectionsNode,
    pub nodes: Vec<LocalConnectionsNode>,
    pub edges: Vec<LocalConnectionsEdge>,
    pub tags: Vec<LocalConnectionsTagNode>,
    pub tag_edges: Vec<LocalConnectionsTagEdge>,
}

#[derive(Serialize)]
pub struct SpaceConnectionsNode {
    pub id: String,
    pub title: String,
    pub link_count: u32,
    pub tag_count: u32,
    pub is_isolated: bool,
}

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SpaceConnectionKind {
    Link,
    Relationship,
}

#[derive(Serialize)]
pub struct SpaceConnectionsEdge {
    pub from_id: String,
    pub to_id: String,
    pub kind: SpaceConnectionKind,
}

#[derive(Serialize)]
pub struct SpaceConnectionsTagNode {
    pub id: String,
    pub tag: String,
    pub title: String,
    pub note_count: u32,
}

#[derive(Serialize)]
pub struct SpaceConnectionsTagEdge {
    pub tag_id: String,
    pub note_id: String,
}

#[derive(Serialize)]
pub struct SpaceConnections {
    pub nodes: Vec<SpaceConnectionsNode>,
    pub edges: Vec<SpaceConnectionsEdge>,
    pub tags: Vec<SpaceConnectionsTagNode>,
    pub tag_edges: Vec<SpaceConnectionsTagEdge>,
    pub truncated: bool,
    pub truncated_tags: bool,
    pub total_notes: u32,
    pub total_tags: u32,
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
