use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FileTreeAppearance {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

impl FileTreeAppearance {
    pub fn normalized(self) -> Option<Self> {
        let color = self.color.and_then(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        });
        let icon = self.icon.and_then(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        });
        if color.is_none() && icon.is_none() {
            None
        } else {
            Some(Self { color, icon })
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTreeAppearanceStore {
    pub version: u32,
    #[serde(default)]
    pub entries: BTreeMap<String, FileTreeAppearance>,
}
