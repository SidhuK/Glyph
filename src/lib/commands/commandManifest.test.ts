import { describe, expect, it } from "vitest";
import {
	APP_COMMANDS,
	getCommandDefinitionByMenuId,
	listCommandDefinitions,
} from "./commandManifest";

const FRONTEND_MENU_COMMAND_IDS = [
	"new-note",
	"create-from-template",
	"open-daily-note",
	"save-note",
	"close-active-tab",
	"open-space",
	"create-space",
	"close-space",
	"reveal-space",
	"open-space-settings",
	"git-sync-now",
	"open-git-sync-settings",
	"open-settings",
	"toggle-ai",
	"close-ai-pane",
	"ai-attach-current-note",
	"ai-attach-all-open-notes",
	"open-ai-settings",
];

describe("app command manifest", () => {
	it("keeps command ids and embedded ids in sync", () => {
		for (const [id, command] of Object.entries(APP_COMMANDS)) {
			expect(command.id).toBe(id);
		}
	});

	it("maps each menu id to exactly one command", () => {
		const menuIds = listCommandDefinitions()
			.map((command) => command.menuId)
			.filter((menuId): menuId is string => Boolean(menuId));

		expect(new Set(menuIds).size).toBe(menuIds.length);
		for (const menuId of menuIds) {
			expect(getCommandDefinitionByMenuId(menuId)?.menuId).toBe(menuId);
		}
	});

	it("contains every renderer-handled native menu command", () => {
		const commandIds = new Set(
			listCommandDefinitions().map((command) => command.id),
		);

		for (const commandId of FRONTEND_MENU_COMMAND_IDS) {
			expect(commandIds.has(commandId)).toBe(true);
		}
	});
});
