import type { ThemeMode } from "../../lib/settings";

export const THEME_MODE_OPTIONS: Array<{
	value: ThemeMode;
	label: string;
	description: string;
}> = [
	{
		value: "system",
		label: "System",
		description: "Match your device light or dark appearance.",
	},
	{
		value: "light",
		label: "Light",
		description: "Always use light mode.",
	},
	{
		value: "dark",
		label: "Dark",
		description: "Always use dark mode.",
	},
];
