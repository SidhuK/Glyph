import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	AiBrain04Icon,
	Archive02Icon,
	ChartIcon,
	CommandIcon,
	GitBranchIcon,
	PencilEdit02Icon,
	Settings01Icon,
	Sun03Icon,
	TestTubeIcon,
} from "@hugeicons/core-free-icons";
import type { ReactElement } from "react";
import { FolderOpen } from "../Icons/NavigationIcons";

export type SettingsTab =
	| "general"
	| "appearance"
	| "editor"
	| "shortcuts"
	| "ai"
	| "space"
	| "git"
	| "about"
	| "usage"
	| "experimental";

export interface SettingsTabMeta {
	id: SettingsTab;
	renderIcon: () => ReactElement;
}

export interface SettingsTabGroup {
	id: "application" | "workspace" | "experimental";
	headingKey: "nav.groupApplication" | "nav.groupWorkspace" | "nav.groupLabs";
	tabs: SettingsTabMeta[];
}

export const SETTINGS_TAB_GROUPS: SettingsTabGroup[] = [
	{
		id: "application",
		headingKey: "nav.groupApplication",
		tabs: [
			{
				id: "general",
				renderIcon: () => (
					<HugeiconsIcon icon={Settings01Icon} size="var(--icon-md)" />
				),
			},
			{
				id: "appearance",
				renderIcon: () => (
					<HugeiconsIcon icon={Sun03Icon} size="var(--icon-md)" />
				),
			},
			{
				id: "editor",
				renderIcon: () => (
					<HugeiconsIcon icon={PencilEdit02Icon} size="var(--icon-md)" />
				),
			},
			{
				id: "shortcuts",
				renderIcon: () => (
					<HugeiconsIcon icon={CommandIcon} size="var(--icon-md)" />
				),
			},
			{
				id: "about",
				renderIcon: () => (
					<HugeiconsIcon icon={Archive02Icon} size="var(--icon-md)" />
				),
			},
		],
	},
	{
		id: "workspace",
		headingKey: "nav.groupWorkspace",
		tabs: [
			{
				id: "space",
				renderIcon: () => <FolderOpen size="var(--icon-md)" />,
			},
			{
				id: "git",
				renderIcon: () => (
					<HugeiconsIcon icon={GitBranchIcon} size="var(--icon-md)" />
				),
			},
			{
				id: "ai",
				renderIcon: () => (
					<HugeiconsIcon icon={AiBrain04Icon} size="var(--icon-md)" />
				),
			},
			{
				id: "usage",
				renderIcon: () => (
					<HugeiconsIcon icon={ChartIcon} size="var(--icon-md)" />
				),
			},
		],
	},
	{
		id: "experimental",
		headingKey: "nav.groupLabs",
		tabs: [
			{
				id: "experimental",
				renderIcon: () => (
					<HugeiconsIcon icon={TestTubeIcon} size="var(--icon-md)" />
				),
			},
		],
	},
];

export const SETTINGS_TABS: SettingsTabMeta[] = SETTINGS_TAB_GROUPS.flatMap(
	(group) => group.tabs,
);
