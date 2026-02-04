use crate::io_atomic;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::Path, path::PathBuf};
use tauri::{AppHandle, Manager};

use super::keychain::keychain_set;
use super::types::{AiProfile, AiProviderKind};

#[derive(Default, Serialize, Deserialize)]
pub struct AiStore {
    #[serde(default)]
    pub profiles: Vec<AiProfile>,
    #[serde(default)]
    pub active_profile_id: Option<String>,
    #[serde(default, rename = "secrets")]
    pub legacy_secrets: HashMap<String, String>,
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

    add("OpenAI", AiProviderKind::Openai, "gpt-4o-mini", None, false);
    add(
        "OpenAI-compatible",
        AiProviderKind::OpenaiCompat,
        "gpt-4o-mini",
        None,
        false,
    );
    add(
        "OpenRouter",
        AiProviderKind::Openrouter,
        "openai/gpt-4o-mini",
        None,
        false,
    );
    add(
        "Anthropic",
        AiProviderKind::Anthropic,
        "claude-3-5-sonnet-latest",
        None,
        false,
    );
    add("Gemini", AiProviderKind::Gemini, "gemini-1.5-flash", None, false);
    add("Ollama", AiProviderKind::Ollama, "llama3.1", None, true);
}

pub fn migrate_legacy_secrets(store: &mut AiStore) {
    if store.legacy_secrets.is_empty() {
        return;
    }
    let mut remaining = HashMap::<String, String>::new();
    for (profile_id, secret) in store.legacy_secrets.clone() {
        if keychain_set(&profile_id, &secret).is_err() {
            remaining.insert(profile_id, secret);
        }
    }
    store.legacy_secrets = remaining;
}
