use crate::ai::types::{AiMessage, AiProviderKind};

pub struct ProviderCapabilities {
    pub requires_max_tokens: bool,
}

pub fn capabilities(provider: &AiProviderKind) -> ProviderCapabilities {
    match provider {
        AiProviderKind::Anthropic => ProviderCapabilities {
            requires_max_tokens: true,
        },
        AiProviderKind::Openai
        | AiProviderKind::OpenaiCompat
        | AiProviderKind::Openrouter
        | AiProviderKind::Gemini
        | AiProviderKind::Ollama => ProviderCapabilities {
            requires_max_tokens: false,
        },
    }
}

pub fn build_transcript(system: &str, messages: &[AiMessage]) -> String {
    let mut parts = Vec::<String>::new();
    if !system.trim().is_empty() {
        parts.push(format!("System:\n{}", system.trim()));
    }
    for m in messages {
        let role = m.role.trim().to_lowercase();
        if role == "system" {
            continue;
        }
        let label = if role == "assistant" { "Assistant" } else { "User" };
        parts.push(format!("{label}:\n{}", m.content.trim()));
    }
    parts.join("\n\n")
}
