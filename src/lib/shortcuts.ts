import { isMacOS } from "./shortcuts/platform";
import type { Shortcut } from "./shortcuts/types";
export type { Shortcut } from "./shortcuts/types";

/**
 * Check if a keyboard event matches a shortcut definition
 */
export function isShortcutMatch(
	event: KeyboardEvent,
	shortcut: Shortcut,
): boolean {
	const isMac = isMacOS();
	if (shortcut.meta) {
		const primaryPressed = isMac ? event.metaKey : event.ctrlKey;
		if (!primaryPressed) return false;
	} else if (event.metaKey) {
		return false;
	}
	if (event.shiftKey !== Boolean(shortcut.shift)) return false;
	if (event.altKey !== Boolean(shortcut.alt)) return false;
	if (!(shortcut.meta && !isMac)) {
		if (event.ctrlKey !== Boolean(shortcut.ctrl)) return false;
	}
	return normalizeKey(event.key) === normalizeKey(shortcut.key);
}

/**
 * Normalize a key string for comparison
 */
function normalizeKey(key: string): string {
	return key.toLowerCase();
}

/**
 * Get a tooltip-friendly string for a shortcut
 * Returns platform-appropriate format (⌘S on macOS, Ctrl+S on Windows/Linux)
 */
export function getShortcutTooltip(shortcut: Shortcut): string {
	const isMac = isMacOS();
	const parts: string[] = [];

	if (shortcut.meta) parts.push(isMac ? "⌘" : "Ctrl");
	if (shortcut.ctrl && !shortcut.meta) parts.push(isMac ? "⌃" : "Ctrl");
	if (shortcut.alt) parts.push(isMac ? "⌥" : "Alt");
	if (shortcut.shift) parts.push(isMac ? "⇧" : "Shift");

	const key =
		shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
	parts.push(key);

	return parts.join(isMac ? "" : "+");
}
