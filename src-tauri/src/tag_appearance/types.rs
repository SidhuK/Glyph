use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct TagAppearance {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

impl TagAppearance {
    pub fn normalized(self) -> Option<Self> {
        let icon = self.icon.and_then(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        });

        icon.map(|icon| Self { icon: Some(icon) })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagAppearanceStore {
    pub version: u32,
    #[serde(default)]
    pub entries: BTreeMap<String, TagAppearance>,
}
