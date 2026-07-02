import type { UiCornerRadiusStyle } from "../../lib/settings";

export const CORNER_RADIUS_OPTIONS: Array<{
	id: UiCornerRadiusStyle;
	label: string;
	description: string;
}> = [
	{
		id: "sharp",
		label: "Brutalist",
		description: "Crisp, square edges throughout the app.",
	},
	{
		id: "default",
		label: "Default",
		description: "Glyph's balanced look.",
	},
	{
		id: "round",
		label: "Soft",
		description: "Gentler, more rounded edges throughout the app.",
	},
];
