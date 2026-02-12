use std::time::Duration;
use url::Url;

use super::types::{AiMessage, AiProfile, AiProviderKind};
use crate::net;

pub fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn default_base_url(provider: &AiProviderKind) -> &'static str {
    match provider {
        AiProviderKind::Openai => "https://api.openai.com/v1",
        AiProviderKind::OpenaiCompat => "http://localhost:11434/v1",
        AiProviderKind::Openrouter => "https://openrouter.ai/api/v1",
        AiProviderKind::Anthropic => "https://api.anthropic.com",
        AiProviderKind::Gemini => "https://generativelanguage.googleapis.com",
        AiProviderKind::Ollama => "http://localhost:11434/v1",
    }
}

pub fn parse_base_url(profile: &AiProfile) -> Result<Url, String> {
    let raw = profile
        .base_url
        .as_deref()
        .unwrap_or_else(|| default_base_url(&profile.provider));
    let normalized = if raw.ends_with('/') {
        raw.to_string()
    } else {
        format!("{}/", raw)
    };
    let url = Url::parse(&normalized).map_err(|_| "invalid base_url".to_string())?;
    match url.scheme() {
        "https" => {}
        "http" if profile.allow_private_hosts => {}
        "http" => return Err("http base_url blocked (enable allow_private_hosts)".to_string()),
        _ => return Err("invalid base_url scheme".to_string()),
    }
    net::validate_url_host(&url, profile.allow_private_hosts)?;
    Ok(url)
}

pub fn apply_extra_headers(
    mut req: reqwest::RequestBuilder,
    profile: &AiProfile,
) -> reqwest::RequestBuilder {
    for h in &profile.headers {
        let key = h.key.trim();
        if key.is_empty() {
            continue;
        }
        req = req.header(key, h.value.clone());
    }
    req
}

pub fn split_system_and_messages(
    mut messages: Vec<AiMessage>,
    context: Option<String>,
) -> (String, Vec<AiMessage>) {
    let mut sys = String::new();
    if let Some(ctx) = context {
        if !ctx.trim().is_empty() {
            sys.push_str("Context (user-approved):\n");
            sys.push_str(ctx.trim());
            sys.push('\n');
        }
    }

    let mut rest = Vec::<AiMessage>::new();
    for m in messages.drain(..) {
        if m.role == "system" {
            if !m.content.trim().is_empty() {
                sys.push_str(m.content.trim());
                sys.push('\n');
            }
            continue;
        }
        rest.push(m);
    }
    (sys.trim().to_string(), rest)
}

pub async fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .user_agent("Lattice/0.1 (ai)")
        .build()
        .map_err(|e| e.to_string())
}
