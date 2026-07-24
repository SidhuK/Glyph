import type { Command } from "./commandPaletteHelpers";
import type { PaletteSettingControl } from "./settingsPaletteRegistry";

export type PaletteResultKind =
	| "command"
	| "setting"
	| "open-tab"
	| "note"
	| "content"
	| "folder"
	| "tag"
	| "person"
	| "database"
	| "template";

export interface PaletteResult {
	id: string;
	kind: PaletteResultKind;
	label: string;
	description?: string;
	category: string;
	keywords: readonly string[];
	enabled: boolean;
	rankBoost?: number;
	defaultVisible?: boolean;
	trailing?: string;
	checked?: boolean;
	previewPath?: string;
	command?: Command;
	target?: string;
	snippet?: string;
	settingId?: string;
	settingControl?: PaletteSettingControl;
}

export const PALETTE_GROUP_ORDER: readonly PaletteResultKind[] = [
	"command",
	"setting",
	"open-tab",
	"note",
	"content",
	"folder",
	"tag",
	"person",
	"database",
	"template",
];
