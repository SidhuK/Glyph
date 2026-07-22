use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize)]
pub struct RolloverCandidate {
    pub id: String,
    pub source_path: String,
    pub source_date: String,
    pub original_date: String,
    #[serde(skip_serializing)]
    pub markdown: String,
    pub text: String,
    pub nested_count: u32,
    pub unfinished_nested_count: u32,
    pub start: usize,
    pub end: usize,
    pub source_mtime_ms: u64,
}

#[derive(Deserialize)]
pub struct RolloverMoveItem {
    pub id: String,
    pub source_path: String,
    pub start: usize,
    pub end: usize,
    pub source_mtime_ms: u64,
}

#[derive(Serialize)]
pub struct RolloverMoveResult {
    pub moved_count: u32,
    pub destination_path: String,
    pub changed_paths: Vec<String>,
}
