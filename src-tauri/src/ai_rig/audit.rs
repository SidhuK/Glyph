use crate::{glyph_paths, io_atomic};
use std::path::{Path, PathBuf};

use super::helpers::{derive_chat_title, now_ms};
use super::types::{AiChatRequest, AiMessage, AiProfile, AiStoredToolEvent};

pub fn audit_log_path(space_root: &Path, job_id: &str) -> Result<PathBuf, String> {
    let base = glyph_paths::ensure_glyph_cache_dir(space_root)?;
    let dir = base.join("ai");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{job_id}.json")))
}

pub fn history_log_path(space_root: &Path, job_id: &str) -> Result<PathBuf, String> {
    let dir = glyph_paths::ensure_ai_history_dir(space_root)?;
    Ok(dir.join(format!("{job_id}.json")))
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    format!("{}…(truncated)", &s[..max])
}

pub struct AuditLogParams<'a> {
    pub space_root: &'a Path,
    pub job_id: &'a str,
    pub history_id: &'a str,
    pub profile: &'a AiProfile,
    pub request: &'a AiChatRequest,
    pub response: &'a str,
    pub title: Option<&'a str>,
    pub cancelled: bool,
    pub tool_events: &'a [AiStoredToolEvent],
}

pub fn write_audit_log(params: &AuditLogParams<'_>) {
    let created_at_ms = now_ms();
    let path = match audit_log_path(params.space_root, params.job_id) {
        Ok(p) => p,
        Err(_) => return,
    };

    let response_truncated = truncate(params.response, 80_000);
    let context_truncated = params
        .request
        .context
        .as_deref()
        .map(|s| truncate(s, 30_000));
    let payload = serde_json::json!({
        "job_id": params.job_id,
        "created_at_ms": created_at_ms,
        "profile": {
            "id": params.profile.id,
            "name": params.profile.name,
            "provider": params.profile.provider,
            "model": params.profile.model,
            "base_url": params.profile.base_url,
        },
        "request": {
            "profile_id": params.request.profile_id,
            "messages": params.request.messages,
            "context_manifest": params.request.context_manifest,
            "context": context_truncated,
        },
        "response": response_truncated,
        "cancelled": params.cancelled,
        "tool_events": params.tool_events,
        "outcome": null
    });
    let bytes = serde_json::to_vec_pretty(&payload).unwrap_or_default();
    let _ = io_atomic::write_atomic(&path, &bytes);
    write_chat_history(params, &response_truncated, created_at_ms);
}

fn write_chat_history(params: &AuditLogParams<'_>, response: &str, created_at_ms: u64) {
    let path = match history_log_path(params.space_root, params.history_id) {
        Ok(p) => p,
        Err(_) => return,
    };

    let mut messages = params.request.messages.clone();
    if !response.trim().is_empty() {
        messages.push(AiMessage {
            role: "assistant".to_string(),
            content: response.to_string(),
        });
    }
    let title = params
        .title
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| derive_chat_title(&messages));

    let payload = serde_json::json!({
        "version": 1,
        "job_id": params.history_id,
        "title": title,
        "created_at_ms": created_at_ms,
        "cancelled": params.cancelled,
        "profile": {
            "id": params.profile.id,
            "name": params.profile.name,
            "provider": params.profile.provider,
            "model": params.profile.model,
        },
        "messages": messages,
        "tool_events": params.tool_events,
    });
    let bytes = serde_json::to_vec_pretty(&payload).unwrap_or_default();
    let _ = io_atomic::write_atomic(&path, &bytes);
}
