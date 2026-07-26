export const HEADING_PALETTE_OPTIONS = [
	{
		id: "classy",
		light: ["#be3d61", "#a45f12", "#267d4c", "#2a74c9", "#7a57d1", "#9b5b2f"],
		dark: ["#ed86a2", "#e6a457", "#67c58d", "#72a9e8", "#a891eb", "#d99a6d"],
	},
	{
		id: "seaside",
		light: ["#006d77", "#147d92", "#3a6f8f", "#9b4f66", "#b4533e", "#6f5a2a"],
		dark: ["#5dc0c8", "#63b3cc", "#83a6d9", "#e19ab5", "#f0a68d", "#d4ba72"],
	},
	{
		id: "woodland",
		light: ["#52602f", "#3f6d48", "#7c6a2a", "#a65f24", "#8f4b3e", "#645382"],
		dark: ["#a9bd72", "#7fba8b", "#d3bd67", "#e5aa66", "#d9907f", "#b6a4d2"],
	},
	{
		id: "sunset",
		light: ["#c83e4d", "#a96700", "#147a9c", "#16815f", "#6246b5", "#9b3e96"],
		dark: ["#ff7c8c", "#ffc45b", "#57c7e8", "#4fd5a5", "#a998ff", "#e582d7"],
	},
	{
		id: "candy",
		light: ["#c2185b", "#9c278b", "#6b2ca6", "#3c3aa1", "#3567c8", "#157b9a"],
		dark: ["#ff70ad", "#e878d8", "#bd8cf5", "#918cff", "#76a2ff", "#61d3ed"],
	},
] as const;

export type HeadingPaletteId = (typeof HEADING_PALETTE_OPTIONS)[number]["id"];

export const DEFAULT_HEADING_PALETTE_ID: HeadingPaletteId = "classy";

export function isHeadingPaletteId(value: unknown): value is HeadingPaletteId {
	return (
		typeof value === "string" &&
		HEADING_PALETTE_OPTIONS.some((palette) => palette.id === value)
	);
}

export function asHeadingPaletteId(value: unknown): HeadingPaletteId {
	return isHeadingPaletteId(value) ? value : DEFAULT_HEADING_PALETTE_ID;
}

export function getHeadingPalette(
	id: HeadingPaletteId,
): (typeof HEADING_PALETTE_OPTIONS)[number] {
	return (
		HEADING_PALETTE_OPTIONS.find((palette) => palette.id === id) ??
		HEADING_PALETTE_OPTIONS[0]
	);
}

export function applyEditorHeadingPalette(id: HeadingPaletteId): void {
	if (typeof document === "undefined") return;
	const palette = getHeadingPalette(id);
	for (const mode of ["light", "dark"] as const) {
		for (const [index, color] of palette[mode].entries()) {
			document.documentElement.style.setProperty(
				`--editor-heading-h${index + 1}-color-${mode}`,
				color,
			);
		}
	}
}
