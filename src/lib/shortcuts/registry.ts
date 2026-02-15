import type { Shortcut } from "./types";

/**
 * Categories for organizing shortcuts in the UI
 */
export type ShortcutCategory =
	| "navigation"
	| "file"
	| "search"
	| "editor"
	| "canvas"
	| "window";

/**
 * Context where a shortcut is active
 */
export type ShortcutContext =
	| "global" // Always active
	| "vault" // Active when a vault is open
	| "editor" // Active when editor is focused
	| "canvas"; // Active when canvas is focused

/**
 * A complete shortcut definition with metadata
 */
export interface ShortcutDefinition {
	/** Unique identifier for the shortcut */
	id: string;
	/** The keyboard combination */
	shortcut: Shortcut;
	/** Human-readable label */
	label: string;
	/** Longer description for help UI */
	description: string;
	/** Category for grouping in UI */
	category: ShortcutCategory;
	/** Context where this shortcut is active */
	context: ShortcutContext;
	/** Optional function to determine if shortcut should be enabled */
	enabled?: () => boolean;
}

/**
 * All keyboard shortcuts in the application.
 * This is the single source of truth for shortcut definitions.
 */
export const SHORTCUTS = [
	// ─────────────────────────────────────────────────────────────────────────
	// Navigation
	// ─────────────────────────────────────────────────────────────────────────
	{
		id: "toggle-sidebar",
		shortcut: { meta: true, key: "b" },
		label: "Toggle Sidebar",
		description: "Show or hide the file tree sidebar",
		category: "navigation",
		context: "global",
	},
	{
		id: "toggle-sidebar-alt",
		shortcut: { meta: true, shift: true, key: "s" },
		label: "Toggle Sidebar",
		description: "Show or hide the file tree sidebar (alternative)",
		category: "navigation",
		context: "global",
	},
	{
		id: "toggle-sidebar-backslash",
		shortcut: { meta: true, key: "\\" },
		label: "Toggle Sidebar",
		description: "Show or hide the file tree sidebar (alternative)",
		category: "navigation",
		context: "global",
	},
	{
		id: "toggle-ai-panel",
		shortcut: { meta: true, shift: true, key: "a" },
		label: "Toggle AI Panel",
		description: "Show or hide the AI assistant panel",
		category: "navigation",
		context: "vault",
	},

	// ─────────────────────────────────────────────────────────────────────────
	// File Operations
	// ─────────────────────────────────────────────────────────────────────────
	{
		id: "new-note",
		shortcut: { meta: true, key: "n" },
		label: "New Note",
		description: "Create a new note in the current folder",
		category: "file",
		context: "vault",
	},
	{
		id: "open-daily-note",
		shortcut: { meta: true, shift: true, key: "d" },
		label: "Open Daily Note",
		description: "Open or create today's daily note",
		category: "file",
		context: "vault",
	},
	{
		id: "save-note",
		shortcut: { meta: true, key: "s" },
		label: "Save Note",
		description: "Save the current note if modified",
		category: "file",
		context: "editor",
	},
	{
		id: "close-preview",
		shortcut: { meta: true, key: "w" },
		label: "Close Preview",
		description: "Close the current preview or note",
		category: "file",
		context: "vault",
	},

	// ─────────────────────────────────────────────────────────────────────────
	// Search & Command Palette
	// ─────────────────────────────────────────────────────────────────────────
	{
		id: "command-palette",
		shortcut: { meta: true, key: "k" },
		label: "Command Palette",
		description: "Open the command palette",
		category: "search",
		context: "global",
	},
	{
		id: "command-palette-alt",
		shortcut: { meta: true, shift: true, key: "p" },
		label: "Command Palette",
		description: "Open the command palette (alternative)",
		category: "search",
		context: "global",
	},
	{
		id: "search",
		shortcut: { meta: true, key: "f" },
		label: "Search",
		description: "Open search in command palette",
		category: "search",
		context: "global",
	},
	{
		id: "quick-open",
		shortcut: { meta: true, key: "p" },
		label: "Quick Open",
		description: "Quick file open (command palette in file mode)",
		category: "search",
		context: "vault",
	},

	// ─────────────────────────────────────────────────────────────────────────
	// Window & App
	// ─────────────────────────────────────────────────────────────────────────
	{
		id: "open-settings",
		shortcut: { meta: true, key: "," },
		label: "Settings",
		description: "Open the settings window",
		category: "window",
		context: "global",
	},
	{
		id: "open-vault",
		shortcut: { meta: true, key: "o" },
		label: "Open Vault",
		description: "Open an existing vault",
		category: "window",
		context: "global",
	},
] as const satisfies ShortcutDefinition[];

const SHORTCUTS_BY_ID = new Map<string, ShortcutDefinition>(
	SHORTCUTS.map((shortcut) => [shortcut.id, shortcut]),
);

/**
 * Get a shortcut definition by its ID
 */
export function getShortcutById(id: string): ShortcutDefinition | undefined {
	return SHORTCUTS_BY_ID.get(id);
}

/**
 * Get all shortcuts for a given context
 */
export function getShortcutsByContext(
	context: ShortcutContext,
): ShortcutDefinition[] {
	return SHORTCUTS.filter((s) => s.context === context);
}

/**
 * Get all shortcuts for a given category
 */
export function getShortcutsByCategory(
	category: ShortcutCategory,
): ShortcutDefinition[] {
	return SHORTCUTS.filter((s) => s.category === category);
}

/**
 * Shortcut IDs as a type for type-safe references
 */
export type ShortcutId = (typeof SHORTCUTS)[number]["id"];
