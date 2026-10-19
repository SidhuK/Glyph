const MERMAID_CODE_BLOCK_LANGUAGE = "mermaid" as const;

export function isMermaidCodeBlockLanguage(language: string | null | undefined): boolean {
	return language?.trim().toLowerCase() === MERMAID_CODE_BLOCK_LANGUAGE;
}
