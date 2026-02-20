import type { AiProviderKind } from "../../lib/tauri";
import { providerLogoMeta } from "./providerLogos";

export const providerLogoMap: Record<
	AiProviderKind,
	{ src: string; label: string }
> = providerLogoMeta;

const openRouterProviderHints: Array<{
	kind: AiProviderKind;
	keywords: string[];
}> = [
	{ kind: "openai", keywords: ["openai"] },
	{ kind: "anthropic", keywords: ["anthropic", "claude"] },
	{ kind: "gemini", keywords: ["gemini", "google"] },
	{ kind: "ollama", keywords: ["ollama"] },
];

export function guessOpenRouterProvider(
	modelName: string,
): AiProviderKind | null {
	const normalized = modelName.toLowerCase();
	for (const hint of openRouterProviderHints) {
		if (hint.keywords.some((kw) => normalized.includes(kw))) return hint.kind;
	}
	return null;
}

export function resolveLogoProvider(
	provider: AiProviderKind | null,
	modelName: string | undefined,
): AiProviderKind | null {
	if (provider !== "openrouter" || !modelName?.trim()) return provider;
	return guessOpenRouterProvider(modelName) ?? provider;
}

export const providerSupportKeyMap: Record<AiProviderKind, string> = {
	openai: "openai",
	openai_compat: "openai_like",
	openrouter: "openrouter",
	anthropic: "anthropic",
	gemini: "gemini",
	ollama: "ollama",
	codex_chatgpt: "openai",
};

const endpointLabelMap: Record<string, string> = {
	chat_completions: "Chat completions",
	messages: "Messages",
	responses: "Responses",
	embeddings: "Embeddings",
	image_generations: "Image generation",
	image_variations: "Image variations",
	image_edits: "Image edits",
	audio_transcriptions: "Audio transcription",
	audio_speech: "Text to speech",
	moderations: "Moderations",
	batches: "Batches",
	rerank: "Re-rank",
	a2a: "Agent-to-agent",
	interactions: "Google Interactions",
	vector_store_files: "Vector store files",
	vector_stores_create: "Vector store create",
	vector_stores_search: "Vector store search",
	assistants: "Assistants",
	container: "Containers",
	container_files: "Container files",
	fine_tuning: "Fine tuning",
	search: "Search",
	realtime: "Realtime",
	text_completion: "Text completion",
	compact: "Compact responses",
};

export function formatEndpointLabel(endpoint: string): string {
	return endpointLabelMap[endpoint] ?? endpoint.replace(/_/g, " ");
}

export function truncateLabel(name: string): string {
	if (name.length <= 30) return name;
	return `${name.slice(0, 27)}…`;
}

export function ProviderLogo({
	provider,
	className,
}: {
	provider: AiProviderKind | null;
	className?: string;
}) {
	if (!provider) return null;
	const config = providerLogoMap[provider];
	if (!config) return null;
	return (
		<img
			src={config.src}
			alt={`${config.label} logo`}
			className={className}
			draggable={false}
		/>
	);
}
