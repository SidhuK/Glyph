use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub enum AiProviderKind {
    Openai,
    OpenaiCompat,
    Openrouter,
    Anthropic,
    Gemini,
    Ollama,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AiHeader {
    pub key: String,
    pub value: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AiProfile {
    pub id: String,
    pub name: String,
    pub provider: AiProviderKind,
    pub model: String,
    pub base_url: Option<String>,
    #[serde(default)]
    pub headers: Vec<AiHeader>,
    #[serde(default)]
    pub allow_private_hosts: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Deserialize, Clone)]
pub struct AiChatRequest {
    pub profile_id: String,
    pub messages: Vec<AiMessage>,
    pub context: Option<String>,
    #[serde(default)]
    pub context_manifest: Option<serde_json::Value>,
    #[serde(default)]
    pub canvas_id: Option<String>,
    #[serde(default)]
    pub audit: bool,
}

#[derive(Serialize)]
pub struct AiChatStartResult {
    pub job_id: String,
}

#[derive(Serialize, Clone)]
pub struct AiChunkEvent {
    pub job_id: String,
    pub delta: String,
}

#[derive(Serialize, Clone)]
pub struct AiDoneEvent {
    pub job_id: String,
    pub cancelled: bool,
}

#[derive(Serialize, Clone)]
pub struct AiErrorEvent {
    pub job_id: String,
    pub message: String,
}
