/**
 * Shortcuts module - centralized keyboard shortcuts for Cipher
 *
 * This module provides:
 * - Type definitions for shortcuts
 * - Platform-aware formatting (⌘ on macOS, Ctrl on Windows/Linux)
 * - A registry of all application shortcuts
 */

// Re-export from the main shortcuts file
export type { Shortcut } from "./types";
export {
	isShortcutMatch,
	getShortcutTooltip,
} from "../shortcuts";

// Export platform utilities
export {
	getPlatform,
	isMacOS,
	isWindows,
	isLinux,
	getPlatformModifier,
	formatShortcutForPlatform,
	formatShortcutPartsForPlatform,
	getModifierDisplay,
} from "./platform";

// Export registry
export {
	SHORTCUTS,
	getShortcutById,
	getShortcutsByContext,
	getShortcutsByCategory,
} from "./registry";
export type {
	ShortcutCategory,
	ShortcutContext,
	ShortcutDefinition,
	ShortcutId,
} from "./registry";
