export type EditorTextHighlight = "yellow" | "blue" | "green" | "red";

export interface EditorTextHighlightOption {
	id: EditorTextHighlight;
	label: string;
	backgroundCssVar: string;
	backgroundFallback: string;
	swatchCssVar: string;
	swatchFallback: string;
}

export const EDITOR_TEXT_HIGHLIGHTS = [
	{
		id: "yellow",
		label: "Yellow",
		backgroundCssVar: "--glyph-inline-highlight-yellow",
		backgroundFallback: "rgba(240, 180, 41, 0.26)",
		swatchCssVar: "--status-warning-fg",
		swatchFallback: "#f0b429",
	},
	{
		id: "blue",
		label: "Blue",
		backgroundCssVar: "--glyph-inline-highlight-blue",
		backgroundFallback: "rgba(59, 155, 220, 0.22)",
		swatchCssVar: "--status-info-fg",
		swatchFallback: "#3b9bdc",
	},
	{
		id: "green",
		label: "Green",
		backgroundCssVar: "--glyph-inline-highlight-green",
		backgroundFallback: "rgba(60, 207, 142, 0.24)",
		swatchCssVar: "--status-success-fg",
		swatchFallback: "#3ccf8e",
	},
	{
		id: "red",
		label: "Red",
		backgroundCssVar: "--glyph-inline-highlight-red",
		backgroundFallback: "rgba(249, 112, 102, 0.2)",
		swatchCssVar: "--status-danger-fg",
		swatchFallback: "#f97066",
	},
] as const satisfies readonly EditorTextHighlightOption[];

const EDITOR_TEXT_HIGHLIGHT_RECORD: Record<
	EditorTextHighlight,
	EditorTextHighlightOption
> = Object.fromEntries(
	EDITOR_TEXT_HIGHLIGHTS.map((option) => [option.id, option]),
) as Record<EditorTextHighlight, EditorTextHighlightOption>;

export function isEditorTextHighlight(
	value: string,
): value is EditorTextHighlight {
	return value in EDITOR_TEXT_HIGHLIGHT_RECORD;
}

export function getEditorTextHighlightOption(highlight: EditorTextHighlight) {
	return EDITOR_TEXT_HIGHLIGHT_RECORD[highlight];
}

export function getEditorTextHighlightStyle(highlight: EditorTextHighlight) {
	const option = getEditorTextHighlightOption(highlight);
	return `background-color: var(${option.backgroundCssVar}, ${option.backgroundFallback})`;
}

export function getEditorTextHighlightMarkdownOpenTag(
	highlight: EditorTextHighlight,
) {
	return `<mark data-glyph-highlight="${highlight}" style="${getEditorTextHighlightStyle(highlight)}">`;
}

export function getEditorTextHighlightBridgeOpenToken(
	highlight: EditorTextHighlight,
) {
	return `{{glyph-highlight:${highlight}}}`;
}

export const EDITOR_TEXT_HIGHLIGHT_BRIDGE_CLOSE_TOKEN = "{{/glyph-highlight}}";
