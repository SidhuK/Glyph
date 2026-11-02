import { type CustomUiThemeId, customThemeSlug, isCustomThemeId } from "./customThemes";

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
		id: "alucard",
		label: "Alucard",
	},
	{
		id: "catppuccin-latte",
		label: "Catppuccin Latte",
	},
	{
		id: "dayfox",
		label: "Dayfox",
	},
	{
		id: "ef-arbutus",
		label: "Arbutus",
	},
	{
		id: "ef-elea-light",
		label: "Elea Light",
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
		id: "gruvbox-light",
		label: "Gruvbox",
	},
	{
		id: "horizon-light",
		label: "Horizon Light",
	},
	{
		id: "kanagawa-lotus",
		label: "Kanagawa Lotus",
	},
	{
		id: "melange-light",
		label: "Melange Light",
	},
	{
		id: "modus-operandi-tinted",
		label: "Modus Operandi Tinted",
	},
	{
		id: "noctis-lilac",
		label: "Noctis Lilac",
	},
	{
		id: "papercolor-light",
		label: "PaperColor",
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
		id: "zenbones-light",
		label: "Zenbones",
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
		id: "cobalt2",
		label: "Cobalt2",
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
		id: "gruvbox-dark",
		label: "Gruvbox Dark",
	},
	{
		id: "horizon-dark",
		label: "Horizon",
	},
	{
		id: "kanagawa-wave",
		label: "Kanagawa Wave",
	},
	{
		id: "melange-dark",
		label: "Melange",
	},
	{
		id: "moonfly",
		label: "Moonfly",
	},
	{
		id: "nord-dark",
		label: "Nord Dark",
	},
	{
		id: "poimandres",
		label: "Poimandres",
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
		id: "synthwave-84",
		label: "SynthWave '84",
	},
	{
		id: "terafox",
		label: "Terafox",
	},
	{
		id: "tokyo-night",
		label: "Tokyo Night",
	},
	{
		id: "vesper",
		label: "Vesper",
	},
	{
		id: "vitesse-dark",
		label: "Vitesse Dark",
	},
	{
		id: "zenburn",
		label: "Zenburn",
	},
] as const satisfies readonly UiThemeOption<string>[];

type UiBuiltInLightThemeId = (typeof LIGHT_THEME_OPTIONS)[number]["id"];
type UiBuiltInDarkThemeId = (typeof DARK_THEME_OPTIONS)[number]["id"];
export type UiLightThemeId = UiBuiltInLightThemeId | CustomUiThemeId;
export type UiDarkThemeId = UiBuiltInDarkThemeId | CustomUiThemeId;

export const GLYPH_DEFAULT_LIGHT_THEME_ID: UiLightThemeId = "glyph-default";
export const GLYPH_DEFAULT_DARK_THEME_ID: UiDarkThemeId = "glyph-default-dark";

const LIGHT_THEME_IDS = new Set<string>(LIGHT_THEME_OPTIONS.map((option) => option.id));
const DARK_THEME_IDS = new Set<string>(DARK_THEME_OPTIONS.map((option) => option.id));

export function asUiLightThemeId(value: unknown): UiLightThemeId {
	return isUiLightThemeId(value) ? value : GLYPH_DEFAULT_LIGHT_THEME_ID;
}

export function asUiDarkThemeId(value: unknown): UiDarkThemeId {
	return isUiDarkThemeId(value) ? value : GLYPH_DEFAULT_DARK_THEME_ID;
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

export function getGlyphDefaultThemeId(mode: "light" | "dark"): UiLightThemeId | UiDarkThemeId {
	return mode === "light" ? GLYPH_DEFAULT_LIGHT_THEME_ID : GLYPH_DEFAULT_DARK_THEME_ID;
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
	return [defaultOption, ...rest.sort((a, b) => a.label.localeCompare(b.label))];
}
