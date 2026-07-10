import { Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SettingsTab } from "../settings/settingsConfig";
import {
	SETTINGS_SEARCH_ENTRIES,
	type SettingsSearchEntry,
	scrollToSettingsSearchEntry,
} from "../settings/settingsSearch";
import type { Command } from "./commandPaletteHelpers";

const SETTINGS_TAB_LABELS = {
	general: "General",
	appearance: "Appearance",
	shortcuts: "Shortcuts",
	ai: "Glyph AI",
	space: "Space",
	git: "Git",
	about: "About",
} as const satisfies Record<SettingsTab, string>;

function commandLabel({
	section,
	title,
}: Pick<SettingsSearchEntry, "section" | "title">) {
	return section && section !== title ? `${section}: ${title}` : title;
}

export function buildSettingsSearchCommands(
	openSettings: (tab?: SettingsTab) => void,
): Command[] {
	return SETTINGS_SEARCH_ENTRIES.map((entry: SettingsSearchEntry) => {
		const tabLabel = SETTINGS_TAB_LABELS[entry.tab];
		return {
			id: `settings-search:${entry.id}`,
			label: commandLabel(entry),
			icon: (
				<HugeiconsIcon
					icon={Settings01Icon}
					size="var(--icon-lg)"
					strokeWidth={0.9}
				/>
			),
			category: `Settings > ${tabLabel}`,
			searchTerms: [
				"settings",
				tabLabel,
				entry.section ?? "",
				entry.description ?? "",
				...(entry.keywords ?? []),
			],
			hideWhenQueryEmpty: true,
			action: () => {
				openSettings(entry.tab);
				scrollToSettingsSearchEntry(entry);
			},
		};
	});
}
