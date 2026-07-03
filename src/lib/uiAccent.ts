import type { UiAccent } from "./settings";

const ACCENT_COLOR_MAP: Record<Exclude<UiAccent, "neutral">, string> = {
	"glyph-orange": "#de7356",
	"glyph-red": "#e84d42",
	cerulean: "#0081a7",
	"tropical-teal": "#00afb9",
};

export function getAccentPreviewColor(
	accent: UiAccent,
	mode: "light" | "dark",
): string {
	if (accent === "neutral") {
		return mode === "dark" ? "#e8e8e8" : "#37352f";
	}
	return ACCENT_COLOR_MAP[accent];
}

export function getAccentOptionColor(accent: UiAccent): string {
	if (accent === "neutral") {
		return "var(--text-primary)";
	}
	return ACCENT_COLOR_MAP[accent];
}
