import { normalizeShortcutKey } from "./shortcuts/normalize";
import { isMacOS } from "./shortcuts/platform";
import type { Shortcut, ShortcutValidationResult } from "./shortcuts/types";

export type { Shortcut, ShortcutValidationResult } from "./shortcuts/types";
export { normalizeShortcutKey } from "./shortcuts/normalize";

const MODIFIER_KEYS = new Set([
	"Meta",
	"Control",
	"Alt",
	"Shift",
	"Super",
	"OS",
]);

export function normalizeShortcut(shortcut: Shortcut): Shortcut {
	return {
		key: normalizeShortcutKey(shortcut.key),
		meta: Boolean(shortcut.meta),
		ctrl: Boolean(shortcut.ctrl),
		alt: Boolean(shortcut.alt),
		shift: Boolean(shortcut.shift),
	};
}

export function hasShortcutModifiers(shortcut: Shortcut): boolean {
	return Boolean(shortcut.meta || shortcut.ctrl || shortcut.alt);
}

export function isShortcutModifierKey(key: string): boolean {
	return MODIFIER_KEYS.has(key);
}

export function shortcutFromKeyboardEvent(
	event: Pick<
		KeyboardEvent,
		"key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
	>,
): Shortcut {
	const keyFromCode = event.code.startsWith("Key")
		? event.code.slice(3)
		: event.code.startsWith("Digit")
			? event.code.slice(5)
			: "";
	return normalizeShortcut({
		key: isShortcutModifierKey(event.key) ? "" : keyFromCode || event.key,
		meta: event.metaKey || event.key === "Meta",
		ctrl: event.ctrlKey || event.key === "Control",
		alt: event.altKey || event.key === "Alt",
		shift: event.shiftKey || event.key === "Shift",
	});
}

export function validateConfigurableShortcut(
	shortcut: Shortcut,
): ShortcutValidationResult {
	const normalized = normalizeShortcut(shortcut);
	if (!normalized.key) {
		return { valid: false, reason: "Choose a key." };
	}
	if (isShortcutModifierKey(normalized.key)) {
		return { valid: false, reason: "Choose a non-modifier key." };
	}
	if (!hasShortcutModifiers(normalized)) {
		return {
			valid: false,
			reason: "Shortcuts need Cmd, Ctrl, or Alt so normal typing stays safe.",
		};
	}
	return { valid: true, reason: null };
}

export function getShortcutSignature(shortcut: Shortcut): string {
	const normalized = normalizeShortcut(shortcut);
	return [
		normalized.meta ? "meta" : "",
		normalized.ctrl ? "ctrl" : "",
		normalized.alt ? "alt" : "",
		normalized.shift ? "shift" : "",
		normalized.key,
	]
		.filter(Boolean)
		.join("+");
}

export function areShortcutsEqual(
	a: Shortcut | null,
	b: Shortcut | null,
): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return getShortcutSignature(a) === getShortcutSignature(b);
}

export function isShortcutMatch(
	event: KeyboardEvent,
	shortcut: Shortcut,
): boolean {
	const normalized = normalizeShortcut(shortcut);
	const isMac = isMacOS();
	if (normalized.meta) {
		const primaryPressed = isMac ? event.metaKey : event.ctrlKey;
		if (!primaryPressed) return false;
	} else if (event.metaKey) {
		return false;
	}
	if (event.shiftKey !== Boolean(normalized.shift)) return false;
	if (event.altKey !== Boolean(normalized.alt)) return false;
	if (!(normalized.meta && !isMac)) {
		if (event.ctrlKey !== Boolean(normalized.ctrl)) return false;
	}
	return normalizeShortcutKey(event.key) === normalized.key;
}

export function getShortcutTooltip(shortcut: Shortcut): string {
	const isMac = isMacOS();
	const parts: string[] = [];
	const normalized = normalizeShortcut(shortcut);

	if (normalized.meta) parts.push(isMac ? "⌘" : "Ctrl");
	if (normalized.ctrl && (isMac || !normalized.meta)) {
		parts.push(isMac ? "⌃" : "Ctrl");
	}
	if (normalized.alt) parts.push(isMac ? "⌥" : "Alt");
	if (normalized.shift) parts.push(isMac ? "⇧" : "Shift");
	parts.push(
		normalized.key.length === 1 ? normalized.key.toUpperCase() : normalized.key,
	);

	return parts.join(isMac ? "" : "+");
}

function toTauriKey(key: string): string | null {
	const normalized = normalizeShortcutKey(key);
	const aliasMap: Record<string, string> = {
		",": ",",
		"[": "[",
		"]": "]",
		"\\": "\\",
		"/": "/",
		".": ".",
		";": ";",
		"'": "'",
		"-": "-",
		"=": "=",
		Enter: "Enter",
		Escape: "Esc",
		Tab: "Tab",
		Space: "Space",
		ArrowLeft: "Left",
		ArrowRight: "Right",
		ArrowUp: "Up",
		ArrowDown: "Down",
	};
	if (aliasMap[normalized]) return aliasMap[normalized];
	if (/^[a-z0-9]$/i.test(normalized)) return normalized.toUpperCase();
	return null;
}

export function toTauriAccelerator(shortcut: Shortcut | null): string | null {
	if (!shortcut) return null;
	const normalized = normalizeShortcut(shortcut);
	const key = toTauriKey(normalized.key);
	if (!key) return null;
	const parts: string[] = [];
	const isMac = isMacOS();
	if (normalized.meta) parts.push("CmdOrCtrl");
	if (normalized.ctrl && (isMac || !normalized.meta)) parts.push("Ctrl");
	if (normalized.alt) parts.push("Alt");
	if (normalized.shift) parts.push("Shift");
	parts.push(key);
	return parts.join("+");
}
