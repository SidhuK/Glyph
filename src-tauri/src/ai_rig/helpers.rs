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
        AiProviderKind::Ollama => "http://localhost:11434",
        AiProviderKind::LlamaCpp => "http://localhost:8080/v1",
        AiProviderKind::CodexChatgpt => "https://developers.openai.com/codex/app-server/",
    }
}

pub fn alternate_openai_base_url(base: &str) -> Option<String> {
    let trimmed = base.trim_end_matches('/');
    if trimmed.is_empty() {
        return None;
    }
    if let Some(prefix) = trimmed.strip_suffix("/v1") {
        let alt = if prefix.is_empty() {
            "/".to_string()
        } else {
            prefix.to_string()
        };
        if alt.trim_end_matches('/') == trimmed {
            None
        } else {
            Some(alt)
        }
    } else {
        Some(format!("{trimmed}/v1"))
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

pub fn parse_ollama_base_url(profile: &AiProfile) -> Result<Url, String> {
    let mut url = parse_base_url(profile)?;
    let trimmed_path = url.path().trim_end_matches('/').to_string();
    let normalized_path = match trimmed_path.strip_suffix("/v1") {
        Some("") => "/".to_string(),
        Some(prefix) => prefix.to_string(),
        None if trimmed_path.is_empty() => "/".to_string(),
        None => trimmed_path,
    };
    if url.path() != normalized_path {
        url.set_path(&normalized_path);
    }
    Ok(url)
}

pub fn ollama_api_url(profile: &AiProfile, path: &str) -> Result<Url, String> {
    let base = parse_ollama_base_url(profile)?;
    let base = base.as_str().trim_end_matches('/');
    Url::parse(&format!("{base}/{}", path.trim_start_matches('/')))
        .map_err(|_| "invalid base_url".to_string())
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

#[cfg(test)]
mod tests {
    use super::{
        alternate_openai_base_url, default_base_url, ollama_api_url, parse_ollama_base_url,
    };
    use crate::ai_rig::types::{AiProfile, AiProviderKind};

    fn ollama_profile(base_url: Option<&str>) -> AiProfile {
        AiProfile {
            id: "ollama".to_string(),
            name: "Ollama".to_string(),
            provider: AiProviderKind::Ollama,
            model: "llama3.2".to_string(),
            base_url: base_url.map(str::to_string),
            headers: Vec::new(),
            allow_private_hosts: true,
            reasoning_effort: None,
        }
    }

    #[test]
    fn ollama_default_base_url_uses_native_api_root() {
        assert_eq!(
            default_base_url(&AiProviderKind::Ollama),
            "http://localhost:11434"
        );
    }

    #[test]
    fn alternate_openai_base_url_adds_v1_suffix() {
        assert_eq!(
            alternate_openai_base_url("http://localhost:8080"),
            Some("http://localhost:8080/v1".to_string())
        );
    }

    #[test]
    fn alternate_openai_base_url_strips_v1_suffix() {
        assert_eq!(
            alternate_openai_base_url("http://localhost:8080/v1"),
            Some("http://localhost:8080".to_string())
        );
    }

    #[test]
    fn alternate_openai_base_url_handles_trailing_slash() {
        assert_eq!(
            alternate_openai_base_url("http://localhost:8080/v1/"),
            Some("http://localhost:8080".to_string())
        );
    }

    #[test]
    fn parse_ollama_base_url_strips_openai_suffix() {
        let profile = ollama_profile(Some("http://localhost:11434/v1"));
        let url = parse_ollama_base_url(&profile).expect("ollama url should parse");
        assert_eq!(url.as_str(), "http://localhost:11434/");
    }

    #[test]
    fn parse_ollama_base_url_preserves_proxy_prefix() {
        let profile = ollama_profile(Some("http://localhost:11434/ollama/v1"));
        let url = parse_ollama_base_url(&profile).expect("ollama url should parse");
        assert_eq!(url.as_str(), "http://localhost:11434/ollama");
    }

    #[test]
    fn ollama_api_url_preserves_proxy_prefix() {
        let profile = ollama_profile(Some("http://localhost:11434/ollama/v1"));
        let url = ollama_api_url(&profile, "api/tags").expect("ollama url should parse");
        assert_eq!(url.as_str(), "http://localhost:11434/ollama/api/tags");
    }
}
