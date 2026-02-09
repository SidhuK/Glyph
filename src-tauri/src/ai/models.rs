use tauri::{AppHandle, State};

use super::helpers::{apply_extra_headers, http_client, parse_base_url};
use super::local_secrets;
use super::store::{ensure_default_profiles, read_store, store_path, write_store};
use super::types::{AiModel, AiProviderKind};
use crate::vault::VaultState;

#[derive(serde::Deserialize)]
struct OpenAIModelsResp {
    data: Vec<OpenAIModelItem>,
}

#[derive(serde::Deserialize)]
struct OpenAIModelItem {
    id: String,
}

async fn list_openai_like(
    client: &reqwest::Client,
    profile: &super::types::AiProfile,
    api_key: &str,
) -> Result<Vec<AiModel>, String> {
    let base = parse_base_url(profile)?;
    let url = base.join("models").map_err(|e| e.to_string())?;

    let mut req = client.get(url);
    req = apply_extra_headers(req, profile);
    if !api_key.is_empty() {
        req = req.bearer_auth(api_key);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("model list failed ({status}): {text}"));
    }

    let parsed: OpenAIModelsResp = resp.json().await.map_err(|e| e.to_string())?;
    let mut models: Vec<AiModel> = parsed
        .data
        .into_iter()
        .map(|m| AiModel {
            name: m.id.clone(),
            id: m.id,
            context_length: None,
            description: None,
        })
        .collect();
    models.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(models)
}

#[derive(serde::Deserialize)]
struct OpenRouterResp {
    data: Vec<OpenRouterModel>,
}

fn deserialize_context_length<'de, D>(deserializer: D) -> Result<Option<u32>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let v: Option<serde_json::Value> = serde::Deserialize::deserialize(deserializer)?;
    match v {
        Some(serde_json::Value::Number(n)) => Ok(n.as_u64().and_then(|n| u32::try_from(n).ok())),
        _ => Ok(None),
    }
}

#[derive(serde::Deserialize)]
struct OpenRouterModel {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_context_length")]
    context_length: Option<u32>,
    #[serde(default)]
    description: Option<String>,
}

async fn list_openrouter(
    client: &reqwest::Client,
    profile: &super::types::AiProfile,
    api_key: &str,
) -> Result<Vec<AiModel>, String> {
    let base = parse_base_url(profile)?;
    let url = base.join("models").map_err(|e| e.to_string())?;

    let mut req = client.get(url).bearer_auth(api_key);
    req = apply_extra_headers(req, profile);

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("model list failed ({status}): {text}"));
    }

    let parsed: OpenRouterResp = resp.json().await.map_err(|e| e.to_string())?;
    let mut models: Vec<AiModel> = parsed
        .data
        .into_iter()
        .map(|m| AiModel {
            name: m.name.unwrap_or_else(|| m.id.clone()),
            id: m.id,
            context_length: m.context_length,
            description: m.description,
        })
        .collect();
    models.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(models)
}

#[derive(serde::Deserialize)]
struct AnthropicResp {
    data: Vec<AnthropicModel>,
}

#[derive(serde::Deserialize)]
struct AnthropicModel {
    id: String,
    #[serde(default)]
    display_name: Option<String>,
}

async fn list_anthropic(
    client: &reqwest::Client,
    profile: &super::types::AiProfile,
    api_key: &str,
) -> Result<Vec<AiModel>, String> {
    let base = parse_base_url(profile)?;
    let url = base.join("v1/models").map_err(|e| e.to_string())?;

    let mut req = client
        .get(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01");
    req = apply_extra_headers(req, profile);

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("model list failed ({status}): {text}"));
    }

    let parsed: AnthropicResp = resp.json().await.map_err(|e| e.to_string())?;
    let mut models: Vec<AiModel> = parsed
        .data
        .into_iter()
        .map(|m| AiModel {
            name: m.display_name.unwrap_or_else(|| m.id.clone()),
            id: m.id,
            context_length: None,
            description: None,
        })
        .collect();
    models.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(models)
}

#[derive(serde::Deserialize)]
struct GeminiResp {
    models: Option<Vec<GeminiModel>>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiModel {
    name: String,
    display_name: Option<String>,
    description: Option<String>,
    input_token_limit: Option<u32>,
}

async fn list_gemini(
    client: &reqwest::Client,
    profile: &super::types::AiProfile,
    api_key: &str,
) -> Result<Vec<AiModel>, String> {
    let base = parse_base_url(profile)?;
    let mut url = base.join("v1beta/models").map_err(|e| e.to_string())?;
    url.query_pairs_mut().append_pair("key", api_key);

    let mut req = client.get(url);
    req = apply_extra_headers(req, profile);

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("model list failed ({status}): {text}"));
    }

    let parsed: GeminiResp = resp.json().await.map_err(|e| e.to_string())?;
    let mut models: Vec<AiModel> = parsed
        .models
        .unwrap_or_default()
        .into_iter()
        .map(|m| {
            let id = m.name.strip_prefix("models/").unwrap_or(&m.name).to_string();
            AiModel {
                name: m.display_name.unwrap_or_else(|| id.clone()),
                id,
                context_length: m.input_token_limit,
                description: m.description,
            }
        })
        .collect();
    models.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(models)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_models_list(
    app: AppHandle,
    vault_state: State<'_, VaultState>,
    profile_id: String,
) -> Result<Vec<AiModel>, String> {
    let path = store_path(&app)?;
    let mut store = read_store(&path);
    ensure_default_profiles(&mut store);
    let vault_root = vault_state.current_root().ok();
    let _ = write_store(&path, &store);

    let profile = store
        .profiles
        .iter()
        .find(|p| p.id == profile_id)
        .cloned()
        .ok_or_else(|| "unknown profile".to_string())?;

    let client = http_client().await?;
    let api_key = vault_root
        .as_deref()
        .and_then(|root| local_secrets::secret_get(root, &profile.id).ok().flatten())
        .unwrap_or_default();
    let api_key = api_key.trim().to_string();

    let needs_key = matches!(
        profile.provider,
        AiProviderKind::Openai | AiProviderKind::Openrouter | AiProviderKind::Anthropic | AiProviderKind::Gemini
    );
    if needs_key && api_key.is_empty() {
        return Err("API key not set for this profile".to_string());
    }

    match profile.provider {
        AiProviderKind::Openai | AiProviderKind::OpenaiCompat | AiProviderKind::Ollama => {
            list_openai_like(&client, &profile, &api_key).await
        }
        AiProviderKind::Openrouter => list_openrouter(&client, &profile, &api_key).await,
        AiProviderKind::Anthropic => list_anthropic(&client, &profile, &api_key).await,
        AiProviderKind::Gemini => list_gemini(&client, &profile, &api_key).await,
    }
}
