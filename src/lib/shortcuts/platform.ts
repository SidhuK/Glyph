import type { Shortcut } from "./types";

/**
 * Cache the platform detection result
 */
let cachedPlatform: "macos" | "windows" | "linux" | null = null;

/**
 * Get the current platform, with caching
 * Uses navigator.userAgent as fallback for non-Tauri environments
 */
export function getPlatform(): "macos" | "windows" | "linux" {
	if (cachedPlatform) return cachedPlatform;

	// Fallback for all environments using navigator
	if (typeof navigator !== "undefined") {
		const ua = navigator.userAgent.toLowerCase();
		if (ua.includes("mac")) {
			cachedPlatform = "macos";
			return "macos";
		}
		if (/windows/i.test(ua)) {
			cachedPlatform = "windows";
			return "windows";
		}
		if (ua.includes("linux")) {
			cachedPlatform = "linux";
			return "linux";
		}
	}

	// Default to macOS for unknown platforms
	cachedPlatform = "macos";
	return "macos";
}

/**
 * Check if we're running on macOS
 */
export function isMacOS(): boolean {
	return getPlatform() === "macos";
}

/**
 * Check if we're running on Windows
 */
export function isWindows(): boolean {
	return getPlatform() === "windows";
}

/**
 * Check if we're running on Linux
 */
export function isLinux(): boolean {
	return getPlatform() === "linux";
}

/**
 * Get the primary modifier key name for the current platform
 * Returns "meta" on macOS, "ctrl" on Windows/Linux
 */
export function getPlatformModifier(): "meta" | "ctrl" {
	return isMacOS() ? "meta" : "ctrl";
}

/**
 * Symbol mappings for modifier keys by platform
 */
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

/**
 * Format a shortcut for display on the current platform
 * Uses symbols on macOS (⌘⇧S) and text on Windows/Linux (Ctrl+Shift+S)
 */
export function formatShortcutForPlatform(shortcut: Shortcut): string {
	return formatShortcutPartsForPlatform(shortcut).join(isMacOS() ? "" : "+");
}

/**
 * Format a shortcut as an array of parts for the current platform
 * Useful for rendering with <kbd> elements
 */
export function formatShortcutPartsForPlatform(shortcut: Shortcut): string[] {
	const p = getPlatform();
	const symbols = MODIFIER_SYMBOLS[p];
	const parts: string[] = [];

	// Order: meta/ctrl, alt, shift, then key
	if (shortcut.meta) {
		parts.push(symbols.meta);
	}
	if (shortcut.ctrl && !shortcut.meta) {
		// Don't show ctrl on macOS if meta is also pressed
		parts.push(symbols.ctrl);
	}
	if (shortcut.alt) {
		parts.push(symbols.alt);
	}
	if (shortcut.shift) {
		parts.push(symbols.shift);
	}

	// Format the key
	const key =
		shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
	parts.push(key);

	return parts;
}

/**
 * Get a display-friendly string for the primary modifier
 * Returns "⌘" on macOS, "Ctrl" on Windows/Linux
 */
export function getModifierDisplay(): string {
	const p = getPlatform();
	return MODIFIER_SYMBOLS[p].meta;
}
