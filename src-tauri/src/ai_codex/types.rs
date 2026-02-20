use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct CodexAccountInfo {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_mode: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct CodexRateLimitWindow {
    pub used_percent: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_duration_mins: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resets_at: Option<u64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct CodexRateLimitBucket {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary: Option<CodexRateLimitWindow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secondary: Option<CodexRateLimitWindow>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct CodexRateLimits {
    pub buckets: Vec<CodexRateLimitBucket>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct CodexLoginStartResult {
    pub auth_url: String,
    pub flow_id: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct CodexLoginCompleteResult {
    pub connected: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct CodexChatStartResult {
    pub job_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexChatStartRequest {
    pub profile_id: String,
    pub thread_id: Option<String>,
    pub messages: Vec<crate::ai_rig::types::AiMessage>,
    pub context: Option<String>,
    pub mode: Option<crate::ai_rig::types::AiAssistantMode>,
}
