use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct LinkPreview {
    pub url: String,
    pub hostname: String,
    pub title: String,
    pub description: String,
    pub image_url: Option<String>,
    #[serde(default)]
    pub image_cache_rel_path: Option<String>,
    pub fetched_at_ms: u64,
    #[serde(default)]
    pub ok: bool,
}
