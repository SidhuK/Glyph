use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{glyph_paths, vault::VaultState};

use super::types::{AiMessage, AiProviderKind, AiStoredToolEvent};

const HISTORY_VERSION: u32 = 1;
const DEFAULT_LIMIT: usize = 25;
const MAX_LIMIT: usize = 200;

#[derive(Serialize)]
pub struct AiChatHistorySummary {
    pub job_id: String,
    pub title: String,
    pub provider: Option<AiProviderKind>,
    pub created_at_ms: u64,
    pub cancelled: bool,
    pub profile_name: String,
    pub model: String,
    pub message_count: usize,
    pub preview: String,
}

#[derive(Deserialize, Default)]
struct StoredProfile {
    #[serde(default)]
    name: String,
    #[serde(default)]
    provider: Option<AiProviderKind>,
    #[serde(default)]
    model: String,
}

#[derive(Deserialize, Default)]
struct StoredHistory {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    job_id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    created_at_ms: u64,
    #[serde(default)]
    cancelled: bool,
    #[serde(default)]
    profile: StoredProfile,
    #[serde(default)]
    messages: Vec<AiMessage>,
    #[serde(default)]
    tool_events: Vec<AiStoredToolEvent>,
}

#[derive(Serialize)]
pub struct AiChatHistoryDetail {
    pub messages: Vec<AiMessage>,
    pub tool_events: Vec<AiStoredToolEvent>,
}

pub async fn ai_chat_history_list(
    vault_state: State<'_, VaultState>,
    limit: Option<u32>,
) -> Result<Vec<AiChatHistorySummary>, String> {
    let root = vault_state.current_root()?;
    let limit = limit
        .unwrap_or(DEFAULT_LIMIT as u32)
        .max(1)
        .min(MAX_LIMIT as u32) as usize;

    tauri::async_runtime::spawn_blocking(move || list_history_impl(&root, limit))
        .await
        .map_err(|e| e.to_string())?
}

pub async fn ai_chat_history_get(
    vault_state: State<'_, VaultState>,
    job_id: String,
) -> Result<AiChatHistoryDetail, String> {
    let _ = uuid::Uuid::parse_str(&job_id).map_err(|_| "invalid job_id".to_string())?;
    let root = vault_state.current_root()?;

    tauri::async_runtime::spawn_blocking(move || get_history_impl(&root, &job_id))
        .await
        .map_err(|e| e.to_string())?
}

fn list_history_impl(
    root: &std::path::Path,
    limit: usize,
) -> Result<Vec<AiChatHistorySummary>, String> {
    let dir = glyph_paths::ai_history_dir(root)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut out: Vec<AiChatHistorySummary> = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = match entry {
            Ok(v) => v,
            Err(_) => continue,
        };
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let bytes = match std::fs::read(&path) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let history: StoredHistory = match serde_json::from_slice(&bytes) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if history.version != 0 && history.version != HISTORY_VERSION {
            continue;
        }

        let fallback_job_id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_string();
        let job_id = if history.job_id.trim().is_empty() {
            fallback_job_id
        } else {
            history.job_id.clone()
        };
        if job_id.trim().is_empty() {
            continue;
        }

        let created_at_ms = if history.created_at_ms > 0 {
            history.created_at_ms
        } else {
            std::fs::metadata(&path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0)
        };

        out.push(AiChatHistorySummary {
            job_id,
            title: title_from_history(&history),
            provider: history.profile.provider.clone(),
            created_at_ms,
            cancelled: history.cancelled,
            profile_name: history.profile.name,
            model: history.profile.model,
            message_count: history.messages.len(),
            preview: preview_from_messages(&history.messages),
        });
    }

    out.sort_by(|a, b| {
        b.created_at_ms
            .cmp(&a.created_at_ms)
            .then_with(|| b.job_id.cmp(&a.job_id))
    });
    if out.len() > limit {
        out.truncate(limit);
    }
    Ok(out)
}

fn get_history_impl(root: &std::path::Path, job_id: &str) -> Result<AiChatHistoryDetail, String> {
    let path = crate::ai_rig::audit::history_log_path(root, job_id)?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let history: StoredHistory = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    if history.version != 0 && history.version != HISTORY_VERSION {
        return Err("unsupported history version".to_string());
    }
    Ok(AiChatHistoryDetail {
        messages: history.messages,
        tool_events: history.tool_events,
    })
}

fn title_from_history(history: &StoredHistory) -> String {
    let stored = history.title.trim();
    if !stored.is_empty() {
        return stored.to_string();
    }

    let user_text = history
        .messages
        .iter()
        .find(|m| m.role == "user" && !m.content.trim().is_empty())
        .map(|m| m.content.trim())
        .unwrap_or_default()
        .to_lowercase();
    if user_text.is_empty() {
        return "Untitled Chat".to_string();
    }

    if user_text.contains("checklist")
        || (user_text.contains("checked") && user_text.contains("unchecked"))
    {
        return "Checklist Reorder".to_string();
    }
    if user_text.contains("summar") {
        return "Summary Request".to_string();
    }
    if user_text.contains("search") || user_text.contains("find") {
        return "Search Request".to_string();
    }

    let mut words: Vec<String> = user_text
        .split_whitespace()
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()))
        .filter(|w| w.len() > 2)
        .take(6)
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_ascii_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .filter(|w| !w.is_empty())
        .collect();

    if words.is_empty() {
        return "Untitled Chat".to_string();
    }
    if words.len() > 5 {
        words.truncate(5);
    }
    words.join(" ")
}

fn preview_from_messages(messages: &[AiMessage]) -> String {
    let mut preview = messages
        .iter()
        .rev()
        .find(|m| m.role == "user" && !m.content.trim().is_empty())
        .map(|m| m.content.as_str())
        .or_else(|| {
            messages
                .iter()
                .rev()
                .find(|m| !m.content.trim().is_empty())
                .map(|m| m.content.as_str())
        })
        .unwrap_or_default()
        .trim()
        .to_string();

    if preview.len() > 160 {
        preview.truncate(160);
        preview.push('…');
    }
    preview
}
