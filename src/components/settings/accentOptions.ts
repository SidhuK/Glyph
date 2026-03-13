import type { UiAccent } from "../../lib/settings";

export const ACCENT_OPTIONS: Array<{
	id: UiAccent;
	label: string;
	color: string;
}> = [
	{ id: "neutral", label: "Neutral", color: "var(--text-primary)" },
	{ id: "cerulean", label: "Cerulean", color: "#0081a7" },
	{ id: "tropical-teal", label: "Tropical Teal", color: "#00afb9" },
	{ id: "light-yellow", label: "Light Yellow", color: "#fdfcdc" },
	{ id: "soft-apricot", label: "Soft Apricot", color: "#fed9b7" },
	{ id: "vibrant-coral", label: "Vibrant Coral", color: "#f07167" },
];

export function getAccentPreviewColor(
	accent: UiAccent,
	mode: "light" | "dark",
): string {
	switch (accent) {
		case "cerulean":
			return "#0081a7";
		case "tropical-teal":
			return "#00afb9";
		case "light-yellow":
			return "#fdfcdc";
		case "soft-apricot":
			return "#fed9b7";
		case "vibrant-coral":
			return "#f07167";
		default:
			return mode === "dark" ? "rgba(255, 255, 255, 0.92)" : "#37352f";
	}
}
