use crate::{io_atomic, lattice_paths};
use std::path::{Path, PathBuf};

use super::helpers::now_ms;
use super::types::{AiChatRequest, AiProfile};

pub fn audit_log_path(vault_root: &Path, job_id: &str) -> Result<PathBuf, String> {
    let base = lattice_paths::ensure_lattice_cache_dir(vault_root)?;
    let dir = base.join("ai");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
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
) {
    let path = match audit_log_path(vault_root, job_id) {
        Ok(p) => p,
        Err(_) => return,
    };

    let response_truncated = truncate(response, 80_000);
    let context_truncated = request.context.as_deref().map(|s| truncate(s, 30_000));
    let payload = serde_json::json!({
        "job_id": job_id,
        "created_at_ms": now_ms(),
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
            "context": context_truncated,
        },
        "response": response_truncated,
        "cancelled": cancelled,
        "outcome": null
    });
    let bytes = serde_json::to_vec_pretty(&payload).unwrap_or_default();
    let _ = io_atomic::write_atomic(&path, &bytes);
}
