use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct AiStatusEvent {
    pub job_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}
