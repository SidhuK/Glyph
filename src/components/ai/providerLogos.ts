import openaiLightThemeLogoUrl from "../../assets/provider-logos/OpenAI_light.svg?url";
import anthropicLogoUrl from "../../assets/provider-logos/claude-ai.svg?url";
import codexDarkThemeLogoUrl from "../../assets/provider-logos/codex-dark.svg?url";
import codexLightThemeLogoUrl from "../../assets/provider-logos/codex-light.svg?url";
import geminiLogoUrl from "../../assets/provider-logos/google-gemini.svg?url";
import llamacppLogoUrl from "../../assets/provider-logos/llamacpp.svg?url";
import ollamaLogoUrl from "../../assets/provider-logos/ollama.svg?url";
import openrouterLogoUrl from "../../assets/provider-logos/open-router.svg?url";
import openaiDarkThemeLogoUrl from "../../assets/provider-logos/openai-light.svg?url";
import type { AiProviderKind } from "../../lib/tauri";

export const providerLogoMeta: Record<
	AiProviderKind,
	{ src: string; darkSrc?: string; label: string }
> = {
	openai: {
		src: openaiLightThemeLogoUrl,
		darkSrc: openaiDarkThemeLogoUrl,
		label: "OpenAI",
	},
	openai_compat: {
		src: openaiLightThemeLogoUrl,
		darkSrc: openaiDarkThemeLogoUrl,
		label: "OpenAI (compat)",
	},
	openrouter: { src: openrouterLogoUrl, label: "OpenRouter" },
	anthropic: { src: anthropicLogoUrl, label: "Anthropic" },
	gemini: { src: geminiLogoUrl, label: "Google Gemini" },
	ollama: { src: ollamaLogoUrl, label: "Ollama" },
	llama_cpp: { src: llamacppLogoUrl, label: "llama.cpp" },
	codex_chatgpt: {
		src: codexLightThemeLogoUrl,
		darkSrc: codexDarkThemeLogoUrl,
		label: "Codex (ChatGPT)",
	},
};

export const providerLogoMap: Record<AiProviderKind, string> = {
	openai: providerLogoMeta.openai.src,
	openai_compat: providerLogoMeta.openai_compat.src,
	openrouter: providerLogoMeta.openrouter.src,
	anthropic: providerLogoMeta.anthropic.src,
	gemini: providerLogoMeta.gemini.src,
	ollama: providerLogoMeta.ollama.src,
	llama_cpp: providerLogoMeta.llama_cpp.src,
	codex_chatgpt: providerLogoMeta.codex_chatgpt.src,
};

export function getProviderLogoSrc(
	provider: AiProviderKind,
	isDark: boolean,
): string {
	const config = providerLogoMeta[provider];
	return isDark ? (config.darkSrc ?? config.src) : config.src;
}
