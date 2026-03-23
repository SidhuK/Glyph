import {
	AiBrain04Icon,
	Archive02Icon,
	Settings01Icon,
	Sun03Icon,
	ToolsIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactElement } from "react";
import { FolderOpen } from "../Icons/NavigationIcons";

export type SettingsTab =
	| "general"
	| "appearance"
	| "ai"
	| "space"
	| "advanced"
	| "about";

export interface SettingsTabMeta {
	id: SettingsTab;
	label: string;
	renderIcon: () => ReactElement;
}

export const SETTINGS_TABS: SettingsTabMeta[] = [
	{
		id: "general",
		label: "General",
		renderIcon: () => <HugeiconsIcon icon={Settings01Icon} size={14} />,
	},
	{
		id: "appearance",
		label: "Appearance",
		renderIcon: () => <HugeiconsIcon icon={Sun03Icon} size={14} />,
	},
	{
		id: "ai",
		label: "AI",
		renderIcon: () => <HugeiconsIcon icon={AiBrain04Icon} size={14} />,
	},
	{
		id: "space",
		label: "Space",
		renderIcon: () => <FolderOpen size={14} />,
	},
	{
		id: "advanced",
		label: "Advanced",
		renderIcon: () => <HugeiconsIcon icon={ToolsIcon} size={14} />,
	},
	{
		id: "about",
		label: "About",
		renderIcon: () => <HugeiconsIcon icon={Archive02Icon} size={14} />,
	},
];

export const SETTINGS_TAB_IDS = new Set<SettingsTab>(
	SETTINGS_TABS.map((tab) => tab.id),
);

export function isSettingsTab(tab: string): tab is SettingsTab {
	return SETTINGS_TAB_IDS.has(tab as SettingsTab);
}
