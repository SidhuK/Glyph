export type EditorTextColor =
	| "gray"
	| "brown"
	| "orange"
	| "yellow"
	| "green"
	| "blue"
	| "purple"
	| "red";

export interface EditorTextColorOption {
	id: EditorTextColor;
	label: string;
	cssVar: string;
	fallbackHex: string;
}

export const EDITOR_TEXT_COLORS = [
	{
		id: "gray",
		label: "Gray",
		cssVar: "--glyph-inline-color-gray",
		fallbackHex: "#626f86",
	},
	{
		id: "brown",
		label: "Brown",
		cssVar: "--glyph-inline-color-brown",
		fallbackHex: "#9f6b53",
	},
	{
		id: "orange",
		label: "Orange",
		cssVar: "--glyph-inline-color-orange",
		fallbackHex: "#d9730d",
	},
	{
		id: "yellow",
		label: "Yellow",
		cssVar: "--glyph-inline-color-yellow",
		fallbackHex: "#cb912f",
	},
	{
		id: "green",
		label: "Green",
		cssVar: "--glyph-inline-color-green",
		fallbackHex: "#448361",
	},
	{
		id: "blue",
		label: "Blue",
		cssVar: "--glyph-inline-color-blue",
		fallbackHex: "#0c66e4",
	},
	{
		id: "purple",
		label: "Purple",
		cssVar: "--glyph-inline-color-purple",
		fallbackHex: "#7e5bef",
	},
	{
		id: "red",
		label: "Red",
		cssVar: "--glyph-inline-color-red",
		fallbackHex: "#e03e3e",
	},
] as const satisfies readonly EditorTextColorOption[];

const EDITOR_TEXT_COLOR_RECORD: Record<EditorTextColor, EditorTextColorOption> =
	Object.fromEntries(
		EDITOR_TEXT_COLORS.map((option) => [option.id, option]),
	) as Record<EditorTextColor, EditorTextColorOption>;

export function isEditorTextColor(value: string): value is EditorTextColor {
	return value in EDITOR_TEXT_COLOR_RECORD;
}

export function getEditorTextColorOption(color: EditorTextColor) {
	return EDITOR_TEXT_COLOR_RECORD[color];
}

export function getEditorTextColorStyle(color: EditorTextColor) {
	const option = getEditorTextColorOption(color);
	// Keep text-color markup free of literal fallback hex values so saved spans
	// don't expose raw color codes in note content when rendered as plain text.
	return `color: var(${option.cssVar})`;
}

export function getEditorTextColorMarkdownOpenTag(color: EditorTextColor) {
	return `<span data-glyph-color="${color}" style="${getEditorTextColorStyle(color)}">`;
}

export function getEditorTextColorBridgeOpenToken(color: EditorTextColor) {
	return `{{glyph-color:${color}}}`;
}

export const EDITOR_TEXT_COLOR_BRIDGE_CLOSE_TOKEN = "{{/glyph-color}}";
