import type { UiAccent } from "../../lib/settings";

const ACCENT_COLOR_MAP: Record<Exclude<UiAccent, "neutral">, string> = {
	"glyph-orange": "#de7356",
	"glyph-red": "#e84d42",
	cerulean: "#0081a7",
	"tropical-teal": "#00afb9",
};

export const ACCENT_OPTIONS: Array<{
	id: UiAccent;
	label: string;
	color: string;
}> = [
	{ id: "neutral", label: "Neutral", color: "var(--text-primary)" },
	{
		id: "glyph-orange",
		label: "Orange",
		color: ACCENT_COLOR_MAP["glyph-orange"],
	},
	{
		id: "glyph-red",
		label: "Glyph Red",
		color: ACCENT_COLOR_MAP["glyph-red"],
	},
	{ id: "cerulean", label: "Cerulean", color: ACCENT_COLOR_MAP.cerulean },
	{
		id: "tropical-teal",
		label: "Tropical Teal",
		color: ACCENT_COLOR_MAP["tropical-teal"],
	},
];

export function getAccentPreviewColor(
	accent: UiAccent,
	mode: "light" | "dark",
): string {
	return (
		ACCENT_COLOR_MAP[accent as Exclude<UiAccent, "neutral">] ??
		(mode === "dark" ? "#ececee" : "#26231d")
	);
}
