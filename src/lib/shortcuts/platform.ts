import { normalizeShortcutKey } from "./normalize";
import type { Shortcut } from "./types";

let cachedPlatform: "macos" | "windows" | "linux" | null = null;

function getPlatform(): "macos" | "windows" | "linux" {
	if (cachedPlatform) return cachedPlatform;

	if (typeof navigator !== "undefined") {
		const ua = navigator.userAgent.toLowerCase();
		if (ua.includes("mac")) {
			cachedPlatform = "macos";
			return "macos";
		}
		if (ua.includes("windows")) {
			cachedPlatform = "windows";
			return "windows";
		}
		if (ua.includes("linux")) {
			cachedPlatform = "linux";
			return "linux";
		}
	}

	cachedPlatform = "macos";
	return "macos";
}

export function isMacOS(): boolean {
	return getPlatform() === "macos";
}

const MODIFIER_SYMBOLS: Record<
	"macos" | "windows" | "linux",
	Record<string, string>
> = {
	macos: {
		meta: "⌘",
		ctrl: "⌃",
		alt: "⌥",
		shift: "⇧",
	},
	windows: {
		meta: "Win",
		ctrl: "Ctrl",
		alt: "Alt",
		shift: "Shift",
	},
	linux: {
		meta: "Super",
		ctrl: "Ctrl",
		alt: "Alt",
		shift: "Shift",
	},
};

export function formatShortcutForPlatform(shortcut: Shortcut): string {
	return formatShortcutPartsForPlatform(shortcut).join(isMacOS() ? "" : "+");
}

export function formatShortcutPartsForPlatform(shortcut: Shortcut): string[] {
	const platform = getPlatform();
	const symbols = MODIFIER_SYMBOLS[platform];
	const parts: string[] = [];
	const key = normalizeShortcutKey(shortcut.key);

	if (shortcut.meta) parts.push(symbols.meta);
	if (shortcut.ctrl && (platform === "macos" || !shortcut.meta)) {
		parts.push(symbols.ctrl);
	}
	if (shortcut.alt) parts.push(symbols.alt);
	if (shortcut.shift) parts.push(symbols.shift);
	parts.push(key.length === 1 ? key.toUpperCase() : key);

	return parts;
}
