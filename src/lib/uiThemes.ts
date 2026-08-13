import {
	type CustomUiThemeId,
	customThemeSlug,
	isCustomThemeId,
} from "./customThemes";

export interface UiThemeOption<T extends string> {
	id: T;
	label: string;
}

export const LIGHT_THEME_OPTIONS = [
	{
		id: "glyph-default",
		label: "Glyph",
	},
	{
		id: "ayu-light",
		label: "Ayu",
	},
	{
		id: "catppuccin-latte",
		label: "Catppuccin Latte",
	},
	{
		id: "claude-light",
		label: "Claude",
	},
	{
		id: "codex-light",
		label: "Codex",
	},
	{
		id: "everforest-light",
		label: "Everforest",
	},
	{
		id: "flexoki-light",
		label: "Flexoki Light",
	},
	{
		id: "github-light",
		label: "GitHub",
	},
	{
		id: "gruvbox-light",
		label: "Gruvbox",
	},
	{
		id: "horizon-light",
		label: "Horizon Light",
	},
	{
		id: "linear-light",
		label: "Linear",
	},
	{
		id: "nord-light",
		label: "Nord Light",
	},
	{
		id: "notion",
		label: "Notion",
	},
	{
		id: "one-light",
		label: "One Light",
	},
	{
		id: "raycast-light",
		label: "Raycast",
	},
	{
		id: "rose-pine-dawn",
		label: "Rose Pine Dawn",
	},
	{
		id: "solarized-light",
		label: "Solarized Light",
	},
	{
		id: "tokyo-night-day",
		label: "Tokyo Night Day",
	},
	{
		id: "xcode-light",
		label: "Xcode",
	},
] as const satisfies readonly UiThemeOption<string>[];

export const DARK_THEME_OPTIONS = [
	{
		id: "glyph-default-dark",
		label: "Glyph",
	},
	{
		id: "ayu-dark",
		label: "Ayu Dark",
	},
	{
		id: "catppuccin-mocha",
		label: "Catppuccin Mocha",
	},
	{
		id: "claude-dark",
		label: "Claude",
	},
	{
		id: "codex-dark",
		label: "Codex",
	},
	{
		id: "dracula",
		label: "Dracula",
	},
	{
		id: "everforest-dark",
		label: "Everforest Dark",
	},
	{
		id: "flexoki-dark",
		label: "Flexoki Dark",
	},
	{
		id: "github-dark",
		label: "GitHub Dark",
	},
	{
		id: "gruvbox-dark",
		label: "Gruvbox Dark",
	},
	{
		id: "monokai",
		label: "Monokai",
	},
	{
		id: "night-owl",
		label: "Night Owl",
	},
	{
		id: "nord-dark",
		label: "Nord Dark",
	},
	{
		id: "one-dark",
		label: "One Dark",
	},
	{
		id: "raycast-dark",
		label: "Raycast",
	},
	{
		id: "rose-pine-moon",
		label: "Rose Pine",
	},
	{
		id: "solarized-dark",
		label: "Solarized Dark",
	},
	{
		id: "tokyo-night",
		label: "Tokyo Night",
	},
	{
		id: "xcode-dark",
		label: "Xcode",
	},
	{
		id: "vesper",
		label: "Vesper",
	},
] as const satisfies readonly UiThemeOption<string>[];

export type UiBuiltInLightThemeId = (typeof LIGHT_THEME_OPTIONS)[number]["id"];
export type UiBuiltInDarkThemeId = (typeof DARK_THEME_OPTIONS)[number]["id"];
export type UiLightThemeId = UiBuiltInLightThemeId | CustomUiThemeId;
export type UiDarkThemeId = UiBuiltInDarkThemeId | CustomUiThemeId;

export const GLYPH_DEFAULT_LIGHT_THEME_ID: UiLightThemeId = "glyph-default";
export const GLYPH_DEFAULT_DARK_THEME_ID: UiDarkThemeId = "glyph-default-dark";

const LIGHT_THEME_IDS = new Set<string>(
	LIGHT_THEME_OPTIONS.map((option) => option.id),
);
const DARK_THEME_IDS = new Set<string>(
	DARK_THEME_OPTIONS.map((option) => option.id),
);
const LIGHT_THEME_MAP = new Map<UiLightThemeId, UiThemeOption<UiLightThemeId>>(
	LIGHT_THEME_OPTIONS.map((option) => [option.id, option]),
);
const DARK_THEME_MAP = new Map<UiDarkThemeId, UiThemeOption<UiDarkThemeId>>(
	DARK_THEME_OPTIONS.map((option) => [option.id, option]),
);
const DEFAULT_LIGHT_THEME_OPTION = LIGHT_THEME_OPTIONS[0];
const DEFAULT_DARK_THEME_OPTION = DARK_THEME_OPTIONS[0];

export function asUiLightThemeId(value: unknown): UiLightThemeId {
	return isUiLightThemeId(value) ? value : GLYPH_DEFAULT_LIGHT_THEME_ID;
}

export function asUiDarkThemeId(value: unknown): UiDarkThemeId {
	return isUiDarkThemeId(value) ? value : GLYPH_DEFAULT_DARK_THEME_ID;
}

export function getUiLightThemeOption(
	themeId: UiLightThemeId,
): UiThemeOption<UiLightThemeId> {
	return LIGHT_THEME_MAP.get(themeId) ?? DEFAULT_LIGHT_THEME_OPTION;
}

export function getUiDarkThemeOption(
	themeId: UiDarkThemeId,
): UiThemeOption<UiDarkThemeId> {
	return DARK_THEME_MAP.get(themeId) ?? DEFAULT_DARK_THEME_OPTION;
}

export function isUiLightThemeId(value: unknown): value is UiLightThemeId {
	if (isCustomThemeId(value)) return true;
	return typeof value === "string" && LIGHT_THEME_IDS.has(value);
}

export function isUiDarkThemeId(value: unknown): value is UiDarkThemeId {
	if (isCustomThemeId(value)) return true;
	return typeof value === "string" && DARK_THEME_IDS.has(value);
}

/** Guards custom theme names against colliding with a shipped preset. */
export function isReservedUiThemeName(name: string): boolean {
	const slug = customThemeSlug(name);
	if (LIGHT_THEME_IDS.has(slug) || DARK_THEME_IDS.has(slug)) return true;
	const label = name.trim().toLowerCase();
	return [...LIGHT_THEME_OPTIONS, ...DARK_THEME_OPTIONS].some(
		(option) => option.label.toLowerCase() === label,
	);
}

export function getGlyphDefaultThemeId(
	mode: "light" | "dark",
): UiLightThemeId | UiDarkThemeId {
	return mode === "light"
		? GLYPH_DEFAULT_LIGHT_THEME_ID
		: GLYPH_DEFAULT_DARK_THEME_ID;
}

export function sortUiThemeOptions<T extends string>(
	options: readonly UiThemeOption<T>[],
	mode: "light" | "dark",
): UiThemeOption<T>[] {
	if (options.length <= 1) {
		return [...options];
	}

	const defaultId = getGlyphDefaultThemeId(mode);
	const defaultOption = options.find((option) => option.id === defaultId);
	if (!defaultOption) {
		return [...options].sort((a, b) => a.label.localeCompare(b.label));
	}

	const rest = options.filter((option) => option.id !== defaultId);
	return [
		defaultOption,
		...rest.sort((a, b) => a.label.localeCompare(b.label)),
	];
}
