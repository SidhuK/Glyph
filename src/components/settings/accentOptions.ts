import type { UiAccent } from "../../lib/settings";

const ACCENT_COLOR_MAP: Record<Exclude<UiAccent, "neutral">, string> = {
	"glyph-orange": "#ff9f0a",
	cerulean: "#0081a7",
	"tropical-teal": "#00afb9",
	"light-yellow": "#fdfcdc",
	"soft-apricot": "#fed9b7",
	"vibrant-coral": "#f07167",
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
	{ id: "cerulean", label: "Cerulean", color: ACCENT_COLOR_MAP.cerulean },
	{
		id: "tropical-teal",
		label: "Tropical Teal",
		color: ACCENT_COLOR_MAP["tropical-teal"],
	},
	{
		id: "light-yellow",
		label: "Light Yellow",
		color: ACCENT_COLOR_MAP["light-yellow"],
	},
	{
		id: "soft-apricot",
		label: "Soft Apricot",
		color: ACCENT_COLOR_MAP["soft-apricot"],
	},
	{
		id: "vibrant-coral",
		label: "Vibrant Coral",
		color: ACCENT_COLOR_MAP["vibrant-coral"],
	},
];

export function getAccentPreviewColor(
	accent: UiAccent,
	mode: "light" | "dark",
): string {
	return (
		ACCENT_COLOR_MAP[accent as Exclude<UiAccent, "neutral">] ??
		(mode === "dark" ? "rgba(255, 255, 255, 0.92)" : "#37352f")
	);
}
