import {
	AiBrain04Icon,
	Archive02Icon,
	ChartIcon,
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
	| "about"
	| "usage";

export interface SettingsTabMeta {
	id: SettingsTab;
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
		renderIcon: () => (
			<HugeiconsIcon
				icon={Settings01Icon}
				size="var(--icon-md)"
				strokeWidth={1.5}
			/>
		),
	},
	{
		id: "appearance",
		renderIcon: () => (
			<HugeiconsIcon icon={Sun03Icon} size="var(--icon-md)" strokeWidth={1.5} />
		),
	},
	{
		id: "shortcuts",
		renderIcon: () => (
			<HugeiconsIcon
				icon={CommandIcon}
				size="var(--icon-md)"
				strokeWidth={1.5}
			/>
		),
	},
	{
		id: "ai",
		renderIcon: () => (
			<HugeiconsIcon
				icon={AiBrain04Icon}
				size="var(--icon-md)"
				strokeWidth={1.5}
			/>
		),
	},
	{
		id: "space",
		renderIcon: () => <FolderOpen size="var(--icon-md)" />,
	},
	{
		id: "git",
		renderIcon: () => (
			<HugeiconsIcon
				icon={GitBranchIcon}
				size="var(--icon-md)"
				strokeWidth={1.5}
			/>
		),
	},
	{
		id: "about",
		renderIcon: () => (
			<HugeiconsIcon
				icon={Archive02Icon}
				size="var(--icon-md)"
				strokeWidth={1.5}
			/>
		),
	},
	{
		id: "usage",
		renderIcon: () => (
			<HugeiconsIcon icon={ChartIcon} size="var(--icon-md)" strokeWidth={1.5} />
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
			(tab) =>
				tab.id === "space" ||
				tab.id === "git" ||
				tab.id === "ai" ||
				tab.id === "usage",
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
