import { Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { i18n } from "../../i18n";
import type { SettingsTab } from "../settings/settingsConfig";
import {
	SETTINGS_SEARCH_ENTRIES,
	localizeSettingsSearchEntry,
	localizedSettingsTabLabel,
	scrollToSettingsSearchEntry,
} from "../settings/settingsSearch";
import type { Command } from "./commandPaletteHelpers";

function commandLabel({
	section,
	title,
}: {
	section?: string;
	title: string;
}) {
	return section && section !== title ? `${section}: ${title}` : title;
}

export function buildSettingsSearchCommands(
	openSettings: (tab?: SettingsTab) => void,
): Command[] {
	return SETTINGS_SEARCH_ENTRIES.map((def) => {
		const entry = localizeSettingsSearchEntry(def);
		const tabLabel = localizedSettingsTabLabel(entry.tab);
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
			category: i18n.t("settings.search:categoryPrefix", { tab: tabLabel }),
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
