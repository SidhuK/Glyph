use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
    /// 0-based occurrence index within the note body (frontmatter excluded), for
    /// jump-to-match. Absent on note-level rows.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_index: Option<u32>,
    /// The literal text `match_index` counts, after search operators are parsed
    /// off. The frontend opens find-in-note with exactly this.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_query: Option<String>,
    /// 1-based line number of the match in the note's source markdown.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
}

#[derive(Serialize)]
pub struct IndexRebuildResult {
    pub indexed: usize,
}

#[derive(Clone, Serialize)]
pub struct IndexProgress {
    pub completed: usize,
    pub total: usize,
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
    pub title: String,
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
    pub is_isolated: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
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
