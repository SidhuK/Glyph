use std::time::Duration;
use url::Url;

use super::types::{AiMessage, AiProfile, AiProviderKind};
use crate::net;

pub use crate::utils::now_ms;

pub fn default_base_url(provider: &AiProviderKind) -> &'static str {
    match provider {
        AiProviderKind::Openai => "https://api.openai.com/v1",
        AiProviderKind::OpenaiCompat => "http://localhost:11434/v1",
        AiProviderKind::Openrouter => "https://openrouter.ai/api/v1",
        AiProviderKind::Anthropic => "https://api.anthropic.com",
        AiProviderKind::Gemini => "https://generativelanguage.googleapis.com",
        AiProviderKind::Ollama => "http://localhost:11434/v1",
        AiProviderKind::CodexChatgpt => "https://developers.openai.com/codex/app-server/",
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

pub fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .user_agent("Glyph/0.1 (ai)")
        .build()
        .map_err(|e| e.to_string())
}

pub fn derive_chat_title(messages: &[AiMessage]) -> String {
    let user_text = messages
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
