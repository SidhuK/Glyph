import anthropicLogoUrl from "../../assets/provider-logos/claude-ai.svg?url";
import geminiLogoUrl from "../../assets/provider-logos/google-gemini.svg?url";
import ollamaLogoUrl from "../../assets/provider-logos/ollama.svg?url";
import openrouterLogoUrl from "../../assets/provider-logos/open-router.svg?url";
import openaiLogoUrl from "../../assets/provider-logos/openai-light.svg?url";
import type { AiProviderKind } from "../../lib/tauri";

export const providerLogoMeta: Record<
	AiProviderKind,
	{ src: string; label: string }
> = {
	openai: { src: openaiLogoUrl, label: "OpenAI" },
	openai_compat: { src: openaiLogoUrl, label: "OpenAI (compat)" },
	openrouter: { src: openrouterLogoUrl, label: "OpenRouter" },
	anthropic: { src: anthropicLogoUrl, label: "Anthropic" },
	gemini: { src: geminiLogoUrl, label: "Google Gemini" },
	ollama: { src: ollamaLogoUrl, label: "Ollama" },
};

export const providerLogoMap: Record<AiProviderKind, string> = {
	openai: providerLogoMeta.openai.src,
	openai_compat: providerLogoMeta.openai_compat.src,
	openrouter: providerLogoMeta.openrouter.src,
	anthropic: providerLogoMeta.anthropic.src,
	gemini: providerLogoMeta.gemini.src,
	ollama: providerLogoMeta.ollama.src,
};
