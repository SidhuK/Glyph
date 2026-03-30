use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinnedFilesStore {
    pub version: u32,
    #[serde(default)]
    pub files: Vec<String>,
}
