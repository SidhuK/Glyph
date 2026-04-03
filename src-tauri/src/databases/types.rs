use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

fn default_true() -> bool {
    true
}

fn default_database_layout() -> String {
    "table".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseSource {
    pub kind: String,
    #[serde(default)]
    pub value: String,
    #[serde(default = "default_true")]
    pub recursive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseNewNoteConfig {
    #[serde(default)]
    pub folder: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseViewGrouping {
    pub column_id: String,
    #[serde(default = "default_true")]
    pub ascending: bool,
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
pub struct DatabaseViewDefinition {
    pub id: String,
    pub name: String,
    #[serde(default = "default_database_layout")]
    pub layout: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub columns: Vec<DatabaseColumn>,
    #[serde(default)]
    pub sorts: Vec<DatabaseSort>,
    #[serde(default)]
    pub filters: Vec<DatabaseFilter>,
    #[serde(default)]
    pub grouping: Option<DatabaseViewGrouping>,
    #[serde(default)]
    pub board_lane_colors: BTreeMap<String, String>,
    #[serde(default)]
    pub board_lane_order: BTreeMap<String, Vec<String>>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseSchemaField {
    pub id: String,
    pub label: String,
    pub kind: String,
    #[serde(default)]
    pub property_key: Option<String>,
    #[serde(default)]
    pub relation_database_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseDefinition {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub is_system: bool,
    pub source: DatabaseSource,
    pub new_note: DatabaseNewNoteConfig,
    #[serde(default)]
    pub schema: Vec<DatabaseSchemaField>,
    #[serde(default)]
    pub views: Vec<DatabaseViewDefinition>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseStore {
    pub version: u32,
    #[serde(default)]
    pub databases: Vec<DatabaseDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseSummary {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub is_system: bool,
    #[serde(default)]
    pub view_count: u32,
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
    pub folder: String,
    pub created: String,
    pub updated: String,
    #[serde(default)]
    pub preview: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub linked_notes: Vec<String>,
    #[serde(default)]
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
pub struct DatabaseDocument {
    pub database: DatabaseDefinition,
    #[serde(default)]
    pub available_properties: Vec<DatabasePropertyOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseQueryResult {
    pub rows: Vec<DatabaseRow>,
    #[serde(default)]
    pub available_properties: Vec<DatabasePropertyOption>,
    pub total_count: u32,
    pub next_offset: Option<u32>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseCreateRowResult {
    pub note_path: String,
    pub row: DatabaseRow,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabasePreviewContext {
    pub note_path: String,
    pub title: String,
    pub markdown: String,
    pub created: String,
    pub updated: String,
    pub word_count: u32,
    pub character_count: u32,
    pub line_count: u32,
    pub reading_time_minutes: u32,
    #[serde(default)]
    pub backlinks: Vec<String>,
}
