const DISPLAY_KEY_ALIASES: Record<string, string> = {
	" ": "Space",
	arrowdown: "ArrowDown",
	arrowleft: "ArrowLeft",
	arrowright: "ArrowRight",
	arrowup: "ArrowUp",
	esc: "Escape",
	return: "Enter",
	del: "Delete",
};

export function normalizeShortcutKey(key: string): string {
	const originalAlias = DISPLAY_KEY_ALIASES[key.toLowerCase()];
	if (originalAlias) return originalAlias;
	const trimmed = key.trim();
	if (!trimmed) return "";
	const alias = DISPLAY_KEY_ALIASES[trimmed.toLowerCase()];
	if (alias) return alias;
	if (trimmed.length === 1) return trimmed.toLowerCase();
	return `${trimmed[0]?.toUpperCase() ?? ""}${trimmed.slice(1)}`;
}
