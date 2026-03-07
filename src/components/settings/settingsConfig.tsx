import { AiBrain04Icon, TextFontIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactElement } from "react";
import {
	FolderOpen,
	InformationCircle,
	Settings as SettingsIcon,
} from "../Icons/NavigationIcons";

export type SettingsTab = "general" | "appearance" | "ai" | "space" | "about";

export interface SettingsTabMeta {
	id: SettingsTab;
	label: string;
	subtitle: string;
	renderIcon: () => ReactElement;
}

export const SETTINGS_TABS: SettingsTabMeta[] = [
	{
		id: "general",
		label: "General",
		subtitle: "Defaults, daily notes, and licensing",
		renderIcon: () => <SettingsIcon size={14} />,
	},
	{
		id: "appearance",
		label: "Appearance",
		subtitle: "Theme, color accents, and typography",
		renderIcon: () => <HugeiconsIcon icon={TextFontIcon} size={14} />,
	},
	{
		id: "ai",
		label: "AI",
		subtitle: "Profiles, providers, and account access",
		renderIcon: () => <HugeiconsIcon icon={AiBrain04Icon} size={14} />,
	},
	{
		id: "space",
		label: "Space",
		subtitle: "Workspace paths, task sources, and search index",
		renderIcon: () => <FolderOpen size={14} />,
	},
	{
		id: "about",
		label: "About",
		subtitle: "Version details, updates, and diagnostics",
		renderIcon: () => <InformationCircle size={14} />,
	},
];

export const SETTINGS_TAB_IDS = new Set<SettingsTab>(
	SETTINGS_TABS.map((tab) => tab.id),
);

export function isSettingsTab(tab: string): tab is SettingsTab {
	return SETTINGS_TAB_IDS.has(tab as SettingsTab);
}
