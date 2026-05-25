import { listCommandDefinitions } from "../lib/commands/commandManifest";
import { invoke } from "../lib/tauri";
import { i18n } from "./index";

const NATIVE_MENU_LABEL_KEYS = [
	"app.about",
	"app.settings",
	"menu.file",
	"menu.edit",
	"menu.markdown",
	"menu.ai",
	"menu.space",
	"menu.window",
	"menu.help",
	"space.recent.menu",
	"space.recent.empty",
	"editor.text_color.menu",
	"editor.text_highlight.menu",
] as const;

export function buildNativeMenuLabels(): Record<string, string> {
	const labels: Record<string, string> = {};

	for (const key of NATIVE_MENU_LABEL_KEYS) {
		labels[key] = i18n.t(`nativeMenu:${key}`);
	}

	for (const command of listCommandDefinitions()) {
		if (!command.menuId) continue;
		labels[command.menuId] = i18n.t(`commands:commands.${command.id}.label`, {
			defaultValue: command.label,
		});
	}

	return labels;
}

export async function syncNativeMenuLabels(): Promise<void> {
	await invoke("set_menu_labels", { labels: buildNativeMenuLabels() });
}
