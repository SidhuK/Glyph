import openaiLightThemeLogoUrl from "../../assets/provider-logos/OpenAI_light.svg?url";
import ampLogoUrl from "../../assets/provider-logos/amp.svg?url";
import anthropicLogoUrl from "../../assets/provider-logos/claude-ai.svg?url";
import codexDarkThemeLogoUrl from "../../assets/provider-logos/codex-dark.svg?url";
import codexLightThemeLogoUrl from "../../assets/provider-logos/codex-light.svg?url";
import geminiLogoUrl from "../../assets/provider-logos/google-gemini.svg?url";
import llamacppLogoUrl from "../../assets/provider-logos/llamacpp.svg?url";
import ollamaLogoUrl from "../../assets/provider-logos/ollama.svg?url";
import openrouterLogoUrl from "../../assets/provider-logos/open-router.svg?url";
import openaiDarkThemeLogoUrl from "../../assets/provider-logos/openai-light.svg?url";
import opencodeDarkThemeLogoUrl from "../../assets/provider-logos/opencode-dark.svg?url";
import opencodeLightThemeLogoUrl from "../../assets/provider-logos/opencode-light.svg?url";
import piDarkThemeLogoUrl from "../../assets/provider-logos/pi-dark.svg?url";
import piLightThemeLogoUrl from "../../assets/provider-logos/pi-light.svg?url";
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
	amp: { src: ampLogoUrl, label: "Amp" },
	opencode: {
		src: opencodeLightThemeLogoUrl,
		darkSrc: opencodeDarkThemeLogoUrl,
		label: "OpenCode",
	},
	pi: {
		src: piLightThemeLogoUrl,
		darkSrc: piDarkThemeLogoUrl,
		label: "PI",
	},
};

export function getProviderLogoSrc(
	provider: AiProviderKind,
	isDark: boolean,
): string {
	const config = providerLogoMeta[provider];
	return isDark ? (config.darkSrc ?? config.src) : config.src;
}
