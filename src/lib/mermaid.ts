export const MERMAID_CODE_BLOCK_LANGUAGE = "mermaid" as const;

export function isMermaidCodeBlockLanguage(
	language: string | null | undefined,
): boolean {
	return language?.trim().toLowerCase() === MERMAID_CODE_BLOCK_LANGUAGE;
}

export function extractMermaidErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message.trim() || "Unable to render Mermaid diagram.";
	}
	if (typeof error === "string" && error.trim()) return error.trim();
	return "Unable to render Mermaid diagram.";
}
