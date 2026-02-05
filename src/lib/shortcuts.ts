export interface Shortcut {
	key: string;
	meta?: boolean;
	shift?: boolean;
	alt?: boolean;
	ctrl?: boolean;
}

export function isShortcutMatch(event: KeyboardEvent, shortcut: Shortcut): boolean {
	if (event.metaKey !== Boolean(shortcut.meta)) return false;
	if (event.shiftKey !== Boolean(shortcut.shift)) return false;
	if (event.altKey !== Boolean(shortcut.alt)) return false;
	if (event.ctrlKey !== Boolean(shortcut.ctrl)) return false;
	return normalizeKey(event.key) === normalizeKey(shortcut.key);
}

export function formatShortcut(shortcut: Shortcut): string {
	const parts: string[] = [];
	if (shortcut.meta) parts.push("⌘");
	if (shortcut.shift) parts.push("⇧");
	if (shortcut.alt) parts.push("⌥");
	if (shortcut.ctrl) parts.push("⌃");
	parts.push(shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key);
	return parts.join("");
}

function normalizeKey(key: string): string {
	return key.toLowerCase();
}
