import {
	AiEditingIcon,
	Archive02Icon,
	CommandIcon,
	ConstructionIcon,
	GitBranchIcon,
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
	| "shortcuts"
	| "ai"
	| "space"
	| "git"
	| "advanced"
	| "about";

export interface SettingsTabMeta {
	id: SettingsTab;
	label: string;
	renderIcon: () => ReactElement;
	badgeText?: string;
	badgeIcon?: () => ReactElement;
}

export interface SettingsTabGroup {
	id: string;
	label: string;
	tabs: SettingsTabMeta[];
}

export const SETTINGS_TABS: SettingsTabMeta[] = [
	{
		id: "general",
		label: "General",
		renderIcon: () => (
			<HugeiconsIcon icon={Settings01Icon} size={14} strokeWidth={0.9} />
		),
	},
	{
		id: "appearance",
		label: "Appearance",
		renderIcon: () => (
			<HugeiconsIcon icon={Sun03Icon} size={14} strokeWidth={0.9} />
		),
	},
	{
		id: "shortcuts",
		label: "Shortcuts",
		renderIcon: () => (
			<HugeiconsIcon icon={CommandIcon} size={14} strokeWidth={0.9} />
		),
	},
	{
		id: "ai",
		label: "Glyph AI",
		renderIcon: () => (
			<HugeiconsIcon icon={AiEditingIcon} size={14} strokeWidth={0.9} />
		),
	},
	{
		id: "space",
		label: "Space",
		renderIcon: () => <FolderOpen size={14} />,
	},
	{
		id: "git",
		label: "Git",
		renderIcon: () => (
			<HugeiconsIcon icon={GitBranchIcon} size={14} strokeWidth={0.9} />
		),
		badgeText: "Beta",
		badgeIcon: () => (
			<HugeiconsIcon icon={ConstructionIcon} size={11} strokeWidth={0.9} />
		),
	},
	{
		id: "advanced",
		label: "Advanced",
		renderIcon: () => (
			<HugeiconsIcon icon={ToolsIcon} size={14} strokeWidth={0.9} />
		),
	},
	{
		id: "about",
		label: "About",
		renderIcon: () => (
			<HugeiconsIcon icon={Archive02Icon} size={14} strokeWidth={0.9} />
		),
	},
];

const SETTINGS_TAB_IDS = new Set<SettingsTab>(
	SETTINGS_TABS.map((tab) => tab.id),
);

const SETTINGS_TAB_GROUPS: SettingsTabGroup[] = [
	{
		id: "workspace",
		label: "Workspace",
		tabs: SETTINGS_TABS.filter(
			(tab) =>
				tab.id === "general" ||
				tab.id === "appearance" ||
				tab.id === "shortcuts" ||
				tab.id === "space",
		),
	},
	{
		id: "services",
		label: "Features",
		tabs: SETTINGS_TABS.filter((tab) => tab.id === "ai" || tab.id === "git"),
	},
	{
		id: "system",
		label: "System",
		tabs: SETTINGS_TABS.filter(
			(tab) => tab.id === "advanced" || tab.id === "about",
		),
	},
];

const coveredSettingsTabIds = new Set(
	SETTINGS_TAB_GROUPS.flatMap((group) => group.tabs.map((tab) => tab.id)),
);

if (import.meta.env.DEV) {
	for (const id of SETTINGS_TAB_IDS) {
		if (!coveredSettingsTabIds.has(id)) {
			console.warn(`Settings tab "${id}" not assigned to any group`);
		}
	}
}
