use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListCollapseStateStore {
    pub version: u32,
    #[serde(default)]
    pub entries: BTreeMap<String, Vec<String>>,
}
