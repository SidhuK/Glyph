import { normalizeShortcutKey } from "./normalize";
import type { Shortcut } from "./types";

const MODIFIER_SYMBOLS = {
	meta: "⌘",
	ctrl: "⌃",
	alt: "⌥",
	shift: "⇧",
} as const;

export function formatShortcutForPlatform(shortcut: Shortcut): string {
	return formatShortcutPartsForPlatform(shortcut).join("");
}

export function formatShortcutPartsForPlatform(shortcut: Shortcut): string[] {
	const parts: string[] = [];
	const key = normalizeShortcutKey(shortcut.key);

	if (shortcut.meta) parts.push(MODIFIER_SYMBOLS.meta);
	if (shortcut.ctrl) parts.push(MODIFIER_SYMBOLS.ctrl);
	if (shortcut.alt) parts.push(MODIFIER_SYMBOLS.alt);
	if (shortcut.shift) parts.push(MODIFIER_SYMBOLS.shift);
	parts.push(key.length === 1 ? key.toUpperCase() : key);

	return parts;
}
