import manifestJson from "../../shared/appCommandManifest.json";
import type { Shortcut } from "../shortcuts/types";

type CommandContext = "global" | "space" | "editor";
export type CommandCategory =
	| "workspace"
	| "navigation"
	| "search"
	| "file"
	| "tabs"
	| "ai"
	| "editor"
	| "settings";

export interface AppCommandDefinition {
	id: string;
	label: string;
	description: string;
	category: CommandCategory;
	context: CommandContext;
	defaultBinding: Shortcut | null;
	allowInEditable: boolean;
	commandPalette: boolean;
	menuId?: string;
}

interface AppCommandManifest {
	commands: Record<string, AppCommandDefinition>;
}

export const APP_COMMANDS = (manifestJson as AppCommandManifest).commands;

export function getCommandDefinition(id: string): AppCommandDefinition | null {
	return APP_COMMANDS[id] ?? null;
}

export function listCommandDefinitions(): AppCommandDefinition[] {
	return Object.values(APP_COMMANDS);
}
