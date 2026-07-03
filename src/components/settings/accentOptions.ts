import type { UiAccent } from "../../lib/settings";
import { getAccentOptionColor } from "../../lib/uiAccent";

export const ACCENT_OPTIONS: Array<{
	id: UiAccent;
	label: string;
	color: string;
}> = [
	{ id: "neutral", label: "Neutral", color: getAccentOptionColor("neutral") },
	{
		id: "glyph-orange",
		label: "Orange",
		color: getAccentOptionColor("glyph-orange"),
	},
	{
		id: "glyph-red",
		label: "Glyph Red",
		color: getAccentOptionColor("glyph-red"),
	},
	{
		id: "cerulean",
		label: "Cerulean",
		color: getAccentOptionColor("cerulean"),
	},
	{
		id: "tropical-teal",
		label: "Tropical Teal",
		color: getAccentOptionColor("tropical-teal"),
	},
];

export { getAccentPreviewColor } from "../../lib/uiAccent";
