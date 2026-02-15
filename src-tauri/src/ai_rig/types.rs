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

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "snake_case")]
pub enum AiAssistantMode {
    Chat,
    #[default]
    Create,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AiModel {
    pub id: String,
    pub name: String,
    pub context_length: Option<u32>,
    pub description: Option<String>,
    pub input_modalities: Option<Vec<String>>,
    pub output_modalities: Option<Vec<String>>,
    pub tokenizer: Option<String>,
    pub prompt_pricing: Option<String>,
    pub completion_pricing: Option<String>,
    pub supported_parameters: Option<Vec<String>>,
    pub max_completion_tokens: Option<u32>,
}

#[derive(Deserialize, Clone)]
pub struct AiChatRequest {
    pub profile_id: String,
    pub messages: Vec<AiMessage>,
    #[serde(default)]
    pub mode: AiAssistantMode,
    pub context: Option<String>,
    #[serde(default)]
    pub context_manifest: Option<serde_json::Value>,
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

#[derive(Serialize, Clone)]
pub struct AiToolEvent {
    pub job_id: String,
    pub tool: String,
    pub phase: String,
    pub at_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct AiStoredToolEvent {
    #[serde(default)]
    pub tool: String,
    #[serde(default)]
    pub phase: String,
    #[serde(default)]
    pub at_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
