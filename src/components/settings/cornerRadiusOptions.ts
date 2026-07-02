import type { UiCornerRadiusStyle } from "../../lib/settings";

export const CORNER_RADIUS_OPTIONS: Array<{
	value: UiCornerRadiusStyle;
	label: string;
	description: string;
}> = [
	{
		value: "sharp",
		label: "Brutalist",
		description: "Crisp, square edges throughout the app.",
	},
	{
		value: "default",
		label: "Default",
		description: "Glyph's balanced look.",
	},
	{
		value: "round",
		label: "Soft",
		description: "Gentler, more rounded edges throughout the app.",
	},
];
