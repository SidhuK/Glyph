use crate::io_atomic;
use serde::{Deserialize, Serialize};
use std::{path::Path, path::PathBuf};
use tauri::{AppHandle, Manager};

use super::types::{AiProfile, AiProviderKind};

#[derive(Default, Serialize, Deserialize)]
pub struct AiStore {
    #[serde(default)]
    pub profiles: Vec<AiProfile>,
    #[serde(default)]
    pub active_profile_id: Option<String>,
}

pub fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("ai.json"))
}

pub fn read_store(path: &Path) -> AiStore {
    let bytes = std::fs::read(path).unwrap_or_default();
    serde_json::from_slice(&bytes).unwrap_or_default()
}

pub fn write_store(path: &Path, store: &AiStore) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(store).map_err(|e| e.to_string())?;
    io_atomic::write_atomic(path, &bytes).map_err(|e| e.to_string())
}

pub fn ensure_default_profiles(store: &mut AiStore) {
    if !store.profiles.is_empty() {
        return;
    }
    let mut add = |name: &str,
                   provider: AiProviderKind,
                   model: &str,
                   base_url: Option<&str>,
                   allow_private_hosts: bool| {
        store.profiles.push(AiProfile {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            provider,
            model: model.to_string(),
            base_url: base_url.map(str::to_string),
            headers: Vec::new(),
            allow_private_hosts,
        });
    };

    add("OpenAI", AiProviderKind::Openai, "", None, false);
    add(
        "OpenAI-compatible",
        AiProviderKind::OpenaiCompat,
        "",
        None,
        false,
    );
    add("OpenRouter", AiProviderKind::Openrouter, "", None, false);
    add("Anthropic", AiProviderKind::Anthropic, "", None, false);
    add("Gemini", AiProviderKind::Gemini, "", None, false);
    add("Ollama", AiProviderKind::Ollama, "", None, true);
    add(
        "Codex (ChatGPT OAuth)",
        AiProviderKind::CodexChatgpt,
        "codex",
        None,
        false,
    );
}
