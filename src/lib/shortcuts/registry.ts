import {
	type AppCommandDefinition,
	type CommandCategory,
	type CommandContext,
	listCommandDefinitions,
} from "../commands/commandManifest";

export type ShortcutActionId = string;
export type ShortcutCategory = CommandCategory;
export type ShortcutContext = CommandContext;

export interface ShortcutActionDefinition extends AppCommandDefinition {
	id: ShortcutActionId;
}

export const SHORTCUT_ACTIONS: ShortcutActionDefinition[] =
	listCommandDefinitions();

if (import.meta.env.DEV) {
	const seen = new Set<string>();
	for (const action of SHORTCUT_ACTIONS) {
		if (seen.has(action.id)) {
			throw new Error(`Duplicate shortcut action id: ${action.id}`);
		}
		seen.add(action.id);
	}
}

const SHORTCUT_ACTION_RECORD: Record<string, ShortcutActionDefinition> =
	Object.fromEntries(SHORTCUT_ACTIONS.map((action) => [action.id, action]));

export const SHORTCUT_CATEGORY_LABELS: Record<ShortcutCategory, string> = {
	workspace: "Workspace",
	navigation: "Navigation",
	search: "Search",
	file: "File Operations",
	tabs: "Tabs",
	ai: "AI",
	editor: "Editor",
	settings: "Settings",
};

export function isShortcutActionId(value: string): value is ShortcutActionId {
	return value in SHORTCUT_ACTION_RECORD;
}

export function getShortcutActionDefinition(actionId: ShortcutActionId) {
	return SHORTCUT_ACTION_RECORD[actionId];
}

export function getShortcutActionsForCommandPalette() {
	return SHORTCUT_ACTIONS.filter((action) => action.commandPalette);
}
