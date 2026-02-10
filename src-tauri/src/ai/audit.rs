use crate::{io_atomic, lattice_paths};
use std::path::{Path, PathBuf};

use super::helpers::now_ms;
use super::types::{AiChatRequest, AiMessage, AiProfile, AiStoredToolEvent};

pub fn audit_log_path(vault_root: &Path, job_id: &str) -> Result<PathBuf, String> {
    let base = lattice_paths::ensure_lattice_cache_dir(vault_root)?;
    let dir = base.join("ai");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{job_id}.json")))
}

pub fn history_log_path(vault_root: &Path, job_id: &str) -> Result<PathBuf, String> {
    let dir = lattice_paths::ensure_ai_history_dir(vault_root)?;
    Ok(dir.join(format!("{job_id}.json")))
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    format!("{}…(truncated)", &s[..max])
}

pub fn write_audit_log(
    vault_root: &Path,
    job_id: &str,
    profile: &AiProfile,
    request: &AiChatRequest,
    response: &str,
    cancelled: bool,
    tool_events: &[AiStoredToolEvent],
) {
    let created_at_ms = now_ms();
    let path = match audit_log_path(vault_root, job_id) {
        Ok(p) => p,
        Err(_) => return,
    };

    let response_truncated = truncate(response, 80_000);
    let context_truncated = request.context.as_deref().map(|s| truncate(s, 30_000));
    let payload = serde_json::json!({
        "job_id": job_id,
        "created_at_ms": created_at_ms,
        "profile": {
            "id": profile.id,
            "name": profile.name,
            "provider": profile.provider,
            "model": profile.model,
            "base_url": profile.base_url,
        },
        "request": {
            "profile_id": request.profile_id,
            "messages": request.messages,
            "context_manifest": request.context_manifest,
            "canvas_id": request.canvas_id,
            "context": context_truncated,
        },
        "response": response_truncated,
        "cancelled": cancelled,
        "tool_events": tool_events,
        "outcome": null
    });
    let bytes = serde_json::to_vec_pretty(&payload).unwrap_or_default();
    let _ = io_atomic::write_atomic(&path, &bytes);
    write_chat_history(
        vault_root,
        job_id,
        profile,
        request,
        &response_truncated,
        cancelled,
        created_at_ms,
        tool_events,
    );
}

fn write_chat_history(
    vault_root: &Path,
    job_id: &str,
    profile: &AiProfile,
    request: &AiChatRequest,
    response: &str,
    cancelled: bool,
    created_at_ms: u64,
    tool_events: &[AiStoredToolEvent],
) {
    let path = match history_log_path(vault_root, job_id) {
        Ok(p) => p,
        Err(_) => return,
    };

    let mut messages = request.messages.clone();
    if !response.trim().is_empty() {
        messages.push(AiMessage {
            role: "assistant".to_string(),
            content: response.to_string(),
        });
    }

    let payload = serde_json::json!({
        "version": 1,
        "job_id": job_id,
        "created_at_ms": created_at_ms,
        "cancelled": cancelled,
        "profile": {
            "id": profile.id,
            "name": profile.name,
            "provider": profile.provider,
            "model": profile.model,
        },
        "messages": messages,
        "tool_events": tool_events,
    });
    let bytes = serde_json::to_vec_pretty(&payload).unwrap_or_default();
    let _ = io_atomic::write_atomic(&path, &bytes);
}
