import {
	type AppCommandDefinition,
	type CommandCategory,
	listShortcutConfigurableCommands,
} from "../commands/commandManifest";

export type ShortcutActionId = string;
export type ShortcutCategory = CommandCategory;

export interface ShortcutActionDefinition extends AppCommandDefinition {
	id: ShortcutActionId;
}

export const SHORTCUT_ACTIONS: ShortcutActionDefinition[] =
	listShortcutConfigurableCommands();

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

export const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
	"workspace",
	"navigation",
	"search",
	"file",
	"tabs",
	"ai",
	"editor",
	"settings",
];

export function isShortcutActionId(value: string): value is ShortcutActionId {
	return value in SHORTCUT_ACTION_RECORD;
}

export function getShortcutActionDefinition(actionId: ShortcutActionId) {
	return SHORTCUT_ACTION_RECORD[actionId];
}
