use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

fn default_true() -> bool {
    true
}

fn default_recursive() -> bool {
    true
}

fn default_database_layout() -> String {
    "table".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseSource {
    pub kind: String,
    pub value: String,
    #[serde(default = "default_recursive")]
    pub recursive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseNewNoteConfig {
    pub folder: String,
    #[serde(default)]
    pub title_prefix: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseViewState {
    #[serde(default = "default_database_layout")]
    pub layout: String,
    #[serde(default)]
    pub board_group_by: Option<String>,
}

impl Default for DatabaseViewState {
    fn default() -> Self {
        Self {
            layout: default_database_layout(),
            board_group_by: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseColumn {
    pub id: String,
    #[serde(rename = "type")]
    pub column_type: String,
    pub label: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default)]
    pub property_key: Option<String>,
    #[serde(default)]
    pub property_kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseSort {
    pub column_id: String,
    pub direction: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseFilter {
    pub column_id: String,
    pub operator: String,
    #[serde(default)]
    pub value_text: Option<String>,
    #[serde(default)]
    pub value_bool: Option<bool>,
    #[serde(default)]
    pub value_list: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseConfig {
    pub source: DatabaseSource,
    pub new_note: DatabaseNewNoteConfig,
    #[serde(default)]
    pub view: DatabaseViewState,
    #[serde(default)]
    pub columns: Vec<DatabaseColumn>,
    #[serde(default)]
    pub sorts: Vec<DatabaseSort>,
    #[serde(default)]
    pub filters: Vec<DatabaseFilter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseCellValue {
    pub kind: String,
    #[serde(default)]
    pub value_text: Option<String>,
    #[serde(default)]
    pub value_bool: Option<bool>,
    #[serde(default)]
    pub value_list: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseRow {
    pub note_path: String,
    pub title: String,
    pub created: String,
    pub updated: String,
    #[serde(default)]
    pub preview: String,
    pub tags: Vec<String>,
    pub properties: BTreeMap<String, DatabaseCellValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabasePropertyOption {
    pub key: String,
    pub kind: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseLoadResult {
    pub config: DatabaseConfig,
    pub rows: Vec<DatabaseRow>,
    pub available_properties: Vec<DatabasePropertyOption>,
    pub truncated: bool,
    pub total_loaded: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseCreateRowResult {
    pub note_path: String,
    pub row: DatabaseRow,
}
