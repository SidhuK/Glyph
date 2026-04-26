use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct NoteProperty {
    pub key: String,
    pub kind: String,
    pub value_text: Option<String>,
    pub value_bool: Option<bool>,
    pub value_list: Vec<String>,
}
