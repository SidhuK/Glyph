export interface UiThemeOption<T extends string> {
	id: T;
	label: string;
	description: string;
}

export const LIGHT_THEME_OPTIONS = [
	{
		id: "glyph-default",
		label: "Glyph Default",
		description: "The current warm neutral light theme.",
	},
	{
		id: "notion",
		label: "Notion",
		description: "Soft cream surfaces with restrained contrast.",
	},
	{
		id: "paper",
		label: "Paper",
		description: "Bright editorial whites with crisp borders.",
	},
	{
		id: "solarized-light",
		label: "Solarized Light",
		description: "Muted beige tones inspired by Solarized.",
	},
	{
		id: "github-light",
		label: "GitHub Light",
		description: "Neutral light grays with clear blue actions.",
	},
	{
		id: "slate-light",
		label: "Slate Light",
		description: "Cool gray surfaces with cleaner contrast.",
	},
	{
		id: "nord-light",
		label: "Nord Light",
		description: "Frosted light tones with subdued blue accents.",
	},
] as const satisfies readonly UiThemeOption<string>[];

export const DARK_THEME_OPTIONS = [
	{
		id: "glyph-default-dark",
		label: "Glyph Default Dark",
		description: "The current neutral dark theme.",
	},
	{
		id: "obsidian",
		label: "Obsidian",
		description: "Low-glare dark stone tones with blue links.",
	},
	{
		id: "graphite",
		label: "Graphite",
		description: "Deep charcoal panels with restrained contrast.",
	},
	{
		id: "solarized-dark",
		label: "Solarized Dark",
		description: "Muted teal-dark surfaces inspired by Solarized.",
	},
	{
		id: "github-dark",
		label: "GitHub Dark",
		description: "Balanced dark neutrals with GitHub-style blue highlights.",
	},
	{
		id: "nord-dark",
		label: "Nord Dark",
		description: "Nordic blue-gray surfaces with soft frost accents.",
	},
	{
		id: "tokyo-night",
		label: "Tokyo Night",
		description: "Inky blue-violet dark theme with vivid cyan accents.",
	},
	{
		id: "dracula",
		label: "Dracula",
		description: "Classic purple-tinted dark theme with vibrant accents.",
	},
] as const satisfies readonly UiThemeOption<string>[];

export type UiLightThemeId = (typeof LIGHT_THEME_OPTIONS)[number]["id"];
export type UiDarkThemeId = (typeof DARK_THEME_OPTIONS)[number]["id"];

export const DEFAULT_UI_LIGHT_THEME_ID: UiLightThemeId = "glyph-default";
export const DEFAULT_UI_DARK_THEME_ID: UiDarkThemeId = "glyph-default-dark";
export const GLYPH_DEFAULT_LIGHT_THEME_ID: UiLightThemeId = "glyph-default";
export const GLYPH_DEFAULT_DARK_THEME_ID: UiDarkThemeId = "glyph-default-dark";

const LIGHT_THEME_IDS = new Set<UiLightThemeId>(
	LIGHT_THEME_OPTIONS.map((option) => option.id),
);
const DARK_THEME_IDS = new Set<UiDarkThemeId>(
	DARK_THEME_OPTIONS.map((option) => option.id),
);

export function asUiLightThemeId(value: unknown): UiLightThemeId {
	return typeof value === "string" &&
		LIGHT_THEME_IDS.has(value as UiLightThemeId)
		? (value as UiLightThemeId)
		: DEFAULT_UI_LIGHT_THEME_ID;
}

export function asUiDarkThemeId(value: unknown): UiDarkThemeId {
	return typeof value === "string" && DARK_THEME_IDS.has(value as UiDarkThemeId)
		? (value as UiDarkThemeId)
		: DEFAULT_UI_DARK_THEME_ID;
}

export function isUiLightThemeId(value: unknown): value is UiLightThemeId {
	return (
		typeof value === "string" && LIGHT_THEME_IDS.has(value as UiLightThemeId)
	);
}

export function isUiDarkThemeId(value: unknown): value is UiDarkThemeId {
	return (
		typeof value === "string" && DARK_THEME_IDS.has(value as UiDarkThemeId)
	);
}

export function isGlyphDefaultLightTheme(themeId: UiLightThemeId): boolean {
	return themeId === GLYPH_DEFAULT_LIGHT_THEME_ID;
}

export function isGlyphDefaultDarkTheme(themeId: UiDarkThemeId): boolean {
	return themeId === GLYPH_DEFAULT_DARK_THEME_ID;
}
