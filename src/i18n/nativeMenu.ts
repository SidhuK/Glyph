import { listCommandDefinitions } from "../lib/commands/commandManifest";
import { invoke } from "../lib/tauri";
import { i18n } from "./index";

const NATIVE_MENU_CHROME_KEYS = [
	["app.about", "app.about"],
	["app.settings", "app.settings"],
	["menu.file", "submenus.file"],
	["menu.edit", "submenus.edit"],
	["menu.markdown", "submenus.markdown"],
	["editor.text_color.menu", "submenus.textColor"],
	["editor.text_highlight.menu", "submenus.textHighlight"],
	["menu.ai", "submenus.ai"],
	["menu.space", "submenus.space"],
	["space.recent.menu", "submenus.recentSpaces"],
	["menu.window", "submenus.window"],
	["menu.help", "submenus.help"],
	["space.recent.empty", "recentSpaces.empty"],
] as const;

export function buildNativeMenuLabels(): Record<string, string> {
	const labels: Record<string, string> = {};

	for (const command of listCommandDefinitions()) {
		if (!command.menuId) continue;
		labels[command.menuId] = i18n.t(`commands:commands.${command.id}.label`);
	}

	// Chrome labels win over command labels for shared IDs (app.about, app.settings).
	for (const [id, key] of NATIVE_MENU_CHROME_KEYS) {
		labels[id] = i18n.t(`menu:${key}`);
	}

	return labels;
}

export async function syncNativeMenuLabels(): Promise<void> {
	await invoke("set_menu_labels", { labels: buildNativeMenuLabels() });
}
