use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::types::AiChunkEvent;

#[derive(Serialize, Clone)]
pub struct AiStatusEvent {
    pub job_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

pub fn emit_chunk(app: &AppHandle, job_id: &str, full: &mut String, delta: &str) {
    if delta.is_empty() {
        return;
    }
    full.push_str(delta);
    let _ = app.emit(
        "ai:chunk",
        AiChunkEvent {
            job_id: job_id.to_string(),
            delta: delta.to_string(),
        },
    );
}

pub fn emit_status(app: &AppHandle, job_id: &str, status: &str, detail: Option<String>) {
    let _ = app.emit(
        "ai:status",
        AiStatusEvent {
            job_id: job_id.to_string(),
            status: status.to_string(),
            detail,
        },
    );
}
