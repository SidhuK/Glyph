import { useIsDarkTheme } from "../../hooks/useIsDarkTheme";
import type { AiProviderKind } from "../../lib/tauri";
import { getProviderLogoSrc, providerLogoMeta } from "./providerLogos";

export const providerLogoMap: Record<AiProviderKind, { src: string; label: string }> =
	providerLogoMeta;

const openRouterProviderHints: Array<{
	kind: AiProviderKind;
	keywords: string[];
}> = [
	{ kind: "openai", keywords: ["openai"] },
	{ kind: "anthropic", keywords: ["anthropic", "claude"] },
	{ kind: "gemini", keywords: ["gemini", "google"] },
	{ kind: "ollama", keywords: ["ollama"] },
	{ kind: "llama_cpp", keywords: ["llama.cpp", "llama_cpp"] },
];

export function guessOpenRouterProvider(modelName: string): AiProviderKind | null {
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

export function truncateLabel(name: string, max = 30): string {
	if (name.length <= max) return name;
	const visibleChars = max === 30 ? 27 : max - 1;
	return `${name.slice(0, visibleChars)}…`;
}

export function ProviderLogo({
	provider,
	className,
}: {
	provider: AiProviderKind | null;
	className?: string;
}) {
	const isDark = useIsDarkTheme();
	if (!provider) return null;
	const config = providerLogoMap[provider];
	if (!config) return null;
	return (
		<img
			src={getProviderLogoSrc(provider, isDark)}
			alt={`${config.label} logo`}
			className={className}
			draggable={false}
		/>
	);
}
