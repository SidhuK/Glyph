import type { AiProviderKind } from "../../../lib/tauri";

const PROVIDERS_WITHOUT_API_KEY = new Set<AiProviderKind>([
	"ollama",
	"llama_cpp",
	"codex_chatgpt",
	"amp",
	"claude_code",
	"opencode",
	"pi",
]);

export function providerNeedsApiKey(provider: AiProviderKind): boolean {
	return !PROVIDERS_WITHOUT_API_KEY.has(provider);
}
