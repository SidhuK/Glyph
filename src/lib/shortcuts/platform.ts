import { normalizeShortcutKey } from "./normalize";
import type { Shortcut } from "./types";

const MODIFIER_SYMBOLS = {
	meta: "⌘",
	ctrl: "⌃",
	alt: "⌥",
	shift: "⇧",
} as const;

/** macOS glyphs for named keys, shared by shortcut labels and the palette's keycap hints. */
export const KEY_GLYPHS = {
	Enter: "↩",
	Escape: "esc",
	ArrowUp: "↑",
	ArrowDown: "↓",
	ArrowLeft: "←",
	ArrowRight: "→",
	Backspace: "⌫",
	Tab: "⇥",
} as const;

function isGlyphKey(key: string): key is keyof typeof KEY_GLYPHS {
	return Object.prototype.hasOwnProperty.call(KEY_GLYPHS, key);
}

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
	parts.push(isGlyphKey(key) ? KEY_GLYPHS[key] : key.length === 1 ? key.toUpperCase() : key);

	return parts;
}
