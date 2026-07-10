import {
	AiBrain04Icon,
	Archive02Icon,
	CommandIcon,
	GitBranchIcon,
	Settings01Icon,
	Sun03Icon,
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
	| "about";

export interface SettingsTabMeta {
	id: SettingsTab;
	label: string;
	renderIcon: () => ReactElement;
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
			<HugeiconsIcon
				icon={Settings01Icon}
				size="var(--icon-md)"
				strokeWidth={0.9}
			/>
		),
	},
	{
		id: "appearance",
		label: "Appearance",
		renderIcon: () => (
			<HugeiconsIcon icon={Sun03Icon} size="var(--icon-md)" strokeWidth={0.9} />
		),
	},
	{
		id: "shortcuts",
		label: "Shortcuts",
		renderIcon: () => (
			<HugeiconsIcon
				icon={CommandIcon}
				size="var(--icon-md)"
				strokeWidth={0.9}
			/>
		),
	},
	{
		id: "ai",
		label: "Glyph AI",
		renderIcon: () => (
			<HugeiconsIcon
				icon={AiBrain04Icon}
				size="var(--icon-md)"
				strokeWidth={0.9}
			/>
		),
	},
	{
		id: "space",
		label: "Space",
		renderIcon: () => <FolderOpen size="var(--icon-md)" />,
	},
	{
		id: "git",
		label: "Git",
		renderIcon: () => (
			<HugeiconsIcon
				icon={GitBranchIcon}
				size="var(--icon-md)"
				strokeWidth={0.9}
			/>
		),
	},
	{
		id: "about",
		label: "About",
		renderIcon: () => (
			<HugeiconsIcon
				icon={Archive02Icon}
				size="var(--icon-md)"
				strokeWidth={0.9}
			/>
		),
	},
];

const SETTINGS_TAB_IDS = new Set<SettingsTab>(
	SETTINGS_TABS.map((tab) => tab.id),
);

export const SETTINGS_TAB_GROUPS: SettingsTabGroup[] = [
	{
		id: "application",
		label: "Application",
		tabs: SETTINGS_TABS.filter(
			(tab) =>
				tab.id === "general" ||
				tab.id === "appearance" ||
				tab.id === "shortcuts" ||
				tab.id === "about",
		),
	},
	{
		id: "workspace",
		label: "Workspace",
		tabs: SETTINGS_TABS.filter(
			(tab) => tab.id === "space" || tab.id === "git" || tab.id === "ai",
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
