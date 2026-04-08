use crate::io_atomic;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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
    let active_provider = store.active_profile_id.as_deref().and_then(|active_id| {
        store
            .profiles
            .iter()
            .find(|profile| profile.id == active_id)
            .map(|profile| profile.provider.clone())
    });

    let mut by_provider: HashMap<&'static str, AiProfile> = HashMap::new();
    for profile in store.profiles.drain(..) {
        by_provider
            .entry(profile.provider.key())
            .or_insert_with(|| profile);
    }

    let defaults = [
        (AiProviderKind::Openai, "", None, false),
        (AiProviderKind::OpenaiCompat, "", None, false),
        (AiProviderKind::Openrouter, "", None, false),
        (AiProviderKind::Anthropic, "", None, false),
        (AiProviderKind::Gemini, "", None, false),
        (AiProviderKind::Ollama, "", None, true),
        (AiProviderKind::CodexChatgpt, "codex", None, false),
    ];

    store.profiles = defaults
        .into_iter()
        .map(|(provider, model, base_url, allow_private_hosts)| {
            let existing = by_provider.remove(provider.key());
            let mut profile = existing.unwrap_or(AiProfile {
                id: provider.key().to_string(),
                name: provider.display_name().to_string(),
                provider: provider.clone(),
                model: model.to_string(),
                base_url: base_url.map(str::to_string),
                headers: Vec::new(),
                allow_private_hosts,
                reasoning_effort: None,
            });
            profile.id = provider.key().to_string();
            profile.name = provider.display_name().to_string();
            profile.provider = provider.clone();
            if profile.model.trim().is_empty() && !model.is_empty() {
                profile.model = model.to_string();
            }
            if profile.base_url.is_none() {
                profile.base_url = base_url.map(str::to_string);
            }
            profile
        })
        .collect();

    store.active_profile_id = active_provider
        .as_ref()
        .map(|provider| provider.key().to_string())
        .or_else(|| store.profiles.first().map(|profile| profile.id.clone()));
}
