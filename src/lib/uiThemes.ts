export interface UiThemePreview {
	badgeBackground: string;
	badgeBorder: string;
	badgeText: string;
	accent: string;
	surface: string;
	surfaceAlt: string;
	border?: string;
	text: string;
}

export interface UiThemeOption<T extends string> {
	id: T;
	label: string;
	description: string;
	preview: UiThemePreview;
}

export const LIGHT_THEME_OPTIONS = [
	{
		id: "glyph-default",
		label: "Glyph Default",
		description: "Warm neutral surfaces with editorial contrast.",
		preview: {
			badgeBackground: "#f7f6f3",
			badgeBorder: "#d3d2cf",
			badgeText: "#37352f",
			accent: "#37352f",
			surface: "#ffffff",
			surfaceAlt: "#f7f6f3",
			text: "#37352f",
		},
	},
	{
		id: "notion",
		label: "Notion",
		description: "Soft cream surfaces with restrained contrast.",
		preview: {
			badgeBackground: "#f7f3ee",
			badgeBorder: "#ddd4c9",
			badgeText: "#2383c6",
			accent: "#2383c6",
			surface: "#ffffff",
			surfaceAlt: "#f8f7f4",
			text: "#37352f",
		},
	},
	{
		id: "paper",
		label: "Paper",
		description: "Bright editorial whites with crisp borders.",
		preview: {
			badgeBackground: "#ffffff",
			badgeBorder: "#d0d7de",
			badgeText: "#0969da",
			accent: "#0969da",
			surface: "#ffffff",
			surfaceAlt: "#f6f8fa",
			text: "#1f2328",
		},
	},
	{
		id: "solarized-light",
		label: "Solarized Light",
		description: "Muted beige tones inspired by Solarized.",
		preview: {
			badgeBackground: "#fdf6e3",
			badgeBorder: "#d9cda8",
			badgeText: "#b58900",
			accent: "#268bd2",
			surface: "#fdf6e3",
			surfaceAlt: "#eee8d5",
			text: "#586e75",
		},
	},
	{
		id: "github-light",
		label: "GitHub Light",
		description: "Neutral light grays with clear blue actions.",
		preview: {
			badgeBackground: "#ffffff",
			badgeBorder: "#d0d7de",
			badgeText: "#0969da",
			accent: "#0969da",
			surface: "#ffffff",
			surfaceAlt: "#f6f8fa",
			text: "#1f2328",
		},
	},
	{
		id: "slate-light",
		label: "Slate Light",
		description: "Cool gray surfaces with cleaner contrast.",
		preview: {
			badgeBackground: "#eff6ff",
			badgeBorder: "#cbd5e1",
			badgeText: "#2563eb",
			accent: "#2563eb",
			surface: "#ffffff",
			surfaceAlt: "#f1f5f9",
			text: "#0f172a",
		},
	},
	{
		id: "nord-light",
		label: "Nord Light",
		description: "Frosted light tones with subdued blue accents.",
		preview: {
			badgeBackground: "#eceff4",
			badgeBorder: "#c4cad4",
			badgeText: "#5e81ac",
			accent: "#5e81ac",
			surface: "#eceff4",
			surfaceAlt: "#d8dee9",
			text: "#2e3440",
		},
	},
	{
		id: "everforest-light",
		label: "Everforest",
		description: "Natural parchment tones with mossy green accents.",
		preview: {
			badgeBackground: "#f1efe6",
			badgeBorder: "#d2cab7",
			badgeText: "#7f9b4e",
			accent: "#7f9b4e",
			surface: "#f6f2e8",
			surfaceAlt: "#e9e2d0",
			text: "#475258",
		},
	},
	{
		id: "linear-light",
		label: "Linear",
		description: "Clean product whites with a cool indigo edge.",
		preview: {
			badgeBackground: "#f4f5fb",
			badgeBorder: "#d9dced",
			badgeText: "#5e6ad2",
			accent: "#5e6ad2",
			surface: "#f7f7f8",
			surfaceAlt: "#eceef5",
			text: "#222530",
		},
	},
	{
		id: "one-light",
		label: "One Light",
		description: "Soft IDE neutrals with balanced blue highlights.",
		preview: {
			badgeBackground: "#f6f7fb",
			badgeBorder: "#d8dde7",
			badgeText: "#4078f2",
			accent: "#4078f2",
			surface: "#fafafa",
			surfaceAlt: "#eef1f7",
			text: "#383a42",
		},
	},
	{
		id: "rose-pine-dawn",
		label: "Rose Pine Dawn",
		description: "Blush-tinted paper with muted plum accents.",
		preview: {
			badgeBackground: "#faf4ed",
			badgeBorder: "#e1d0c8",
			badgeText: "#b4637a",
			accent: "#b4637a",
			surface: "#faf4ed",
			surfaceAlt: "#f2e9e1",
			text: "#575279",
		},
	},
	{
		id: "vscode-plus-light",
		label: "VS Code Plus",
		description: "Studio white surfaces with familiar azure controls.",
		preview: {
			badgeBackground: "#f3f3f3",
			badgeBorder: "#d0d0d0",
			badgeText: "#007acc",
			accent: "#007acc",
			surface: "#ffffff",
			surfaceAlt: "#f3f3f3",
			text: "#1e1e1e",
		},
	},
	{
		id: "catppuccin-latte",
		label: "Catppuccin Latte",
		description: "Soft pastel light theme from the Catppuccin family.",
		preview: {
			badgeBackground: "#eff1f5",
			badgeBorder: "#ccd0da",
			badgeText: "#8839ef",
			accent: "#1e66f5",
			surface: "#eff1f5",
			surfaceAlt: "#e6e9ef",
			text: "#4c4f69",
		},
	},
	{
		id: "gruvbox-light",
		label: "Gruvbox Light",
		description: "Retro groove light palette with warm paper contrast.",
		preview: {
			badgeBackground: "#fbf1c7",
			badgeBorder: "#d5c4a1",
			badgeText: "#af3a03",
			accent: "#076678",
			surface: "#fbf1c7",
			surfaceAlt: "#ebdbb2",
			text: "#3c3836",
		},
	},
	{
		id: "ayu-light",
		label: "Ayu Light",
		description: "Bright all-day light theme with warm amber accents.",
		preview: {
			badgeBackground: "#fcfcfc",
			badgeBorder: "#d9d8d7",
			badgeText: "#ff9940",
			accent: "#399ee6",
			surface: "#fcfcfc",
			surfaceAlt: "#f0eee4",
			text: "#5c6773",
		},
	},
] as const satisfies readonly UiThemeOption<string>[];

export const DARK_THEME_OPTIONS = [
	{
		id: "glyph-default-dark",
		label: "Glyph Default Dark",
		description: "Soft charcoal surfaces with warm off-white text.",
		preview: {
			badgeBackground: "#262626",
			badgeBorder: "#3a3a3a",
			badgeText: "rgba(255, 255, 255, 0.92)",
			accent: "rgba(255, 255, 255, 0.92)",
			surface: "#1e1e1e",
			surfaceAlt: "#262626",
			text: "rgba(255, 255, 255, 0.92)",
		},
	},
	{
		id: "obsidian",
		label: "Obsidian",
		description: "Low-glare dark stone tones with blue links.",
		preview: {
			badgeBackground: "#0f1720",
			badgeBorder: "#1d2e40",
			badgeText: "#7cc4ff",
			accent: "#7cc4ff",
			surface: "#1f2125",
			surfaceAlt: "#26292f",
			text: "#f5f7fa",
		},
	},
	{
		id: "graphite",
		label: "Graphite",
		description: "Deep charcoal panels with restrained contrast.",
		preview: {
			badgeBackground: "#14161a",
			badgeBorder: "#262b33",
			badgeText: "#cfd4dc",
			accent: "#d1d5db",
			surface: "#17181b",
			surfaceAlt: "#1f2125",
			text: "#eff1f4",
		},
	},
	{
		id: "solarized-dark",
		label: "Solarized Dark",
		description: "Muted teal-dark surfaces inspired by Solarized.",
		preview: {
			badgeBackground: "#001f27",
			badgeBorder: "#0b3b47",
			badgeText: "#ff4d4d",
			accent: "#268bd2",
			surface: "#002b36",
			surfaceAlt: "#073642",
			text: "#93a1a1",
		},
	},
	{
		id: "github-dark",
		label: "GitHub Dark",
		description: "Balanced dark neutrals with GitHub-style blue highlights.",
		preview: {
			badgeBackground: "#0d1117",
			badgeBorder: "#30363d",
			badgeText: "#58a6ff",
			accent: "#2f81f7",
			surface: "#0d1117",
			surfaceAlt: "#161b22",
			text: "#e6edf3",
		},
	},
	{
		id: "nord-dark",
		label: "Nord Dark",
		description: "Nordic blue-gray surfaces with soft frost accents.",
		preview: {
			badgeBackground: "#232833",
			badgeBorder: "#3f4858",
			badgeText: "#88c0d0",
			accent: "#88c0d0",
			surface: "#2e3440",
			surfaceAlt: "#3b4252",
			text: "#eceff4",
		},
	},
	{
		id: "tokyo-night",
		label: "Tokyo Night",
		description: "Inky blue-violet dark theme with vivid cyan accents.",
		preview: {
			badgeBackground: "#13141d",
			badgeBorder: "#28304a",
			badgeText: "#7dcfff",
			accent: "#7aa2f7",
			surface: "#1a1b26",
			surfaceAlt: "#24283b",
			text: "#c0caf5",
		},
	},
	{
		id: "dracula",
		label: "Dracula",
		description: "Classic purple-tinted dark theme with vibrant accents.",
		preview: {
			badgeBackground: "#181a24",
			badgeBorder: "#3a3752",
			badgeText: "#bd93f9",
			accent: "#bd93f9",
			surface: "#282a36",
			surfaceAlt: "#303341",
			text: "#f8f8f2",
		},
	},
	{
		id: "night-owl",
		label: "Night Owl",
		description: "Deep navy editor tones with electric blue contrast.",
		preview: {
			badgeBackground: "#07111d",
			badgeBorder: "#16314c",
			badgeText: "#82aaff",
			accent: "#82aaff",
			surface: "#011627",
			surfaceAlt: "#0b1d32",
			text: "#d6deeb",
		},
	},
	{
		id: "one-dark",
		label: "One Dark",
		description: "Modern IDE charcoal with balanced saturated accents.",
		preview: {
			badgeBackground: "#151922",
			badgeBorder: "#2d3443",
			badgeText: "#61afef",
			accent: "#61afef",
			surface: "#282c34",
			surfaceAlt: "#21252b",
			text: "#abb2bf",
		},
	},
	{
		id: "rose-pine-moon",
		label: "Rose Pine",
		description: "Lavender dusk surfaces with refined mauve accents.",
		preview: {
			badgeBackground: "#171521",
			badgeBorder: "#383154",
			badgeText: "#eb9cb4",
			accent: "#c4a7e7",
			surface: "#232136",
			surfaceAlt: "#2a273f",
			text: "#e0def4",
		},
	},
	{
		id: "sentry",
		label: "Sentry",
		description: "Alert purple chrome with soft lilac typography.",
		preview: {
			badgeBackground: "#1b1530",
			badgeBorder: "#35275a",
			badgeText: "#7c5cff",
			accent: "#7c5cff",
			surface: "#1c1630",
			surfaceAlt: "#251f40",
			text: "#e9ddff",
		},
	},
	{
		id: "temple-dark",
		label: "Temple",
		description: "Forest-black panels with luminous chartreuse accents.",
		preview: {
			badgeBackground: "#030d08",
			badgeBorder: "#173223",
			badgeText: "#b8e248",
			accent: "#b8e248",
			surface: "#061510",
			surfaceAlt: "#0b2119",
			text: "#d8f5c1",
		},
	},
	{
		id: "catppuccin-mocha",
		label: "Catppuccin Mocha",
		description: "Deep pastel dark theme from the Catppuccin family.",
		preview: {
			badgeBackground: "#181825",
			badgeBorder: "#313244",
			badgeText: "#cba6f7",
			accent: "#89b4fa",
			surface: "#1e1e2e",
			surfaceAlt: "#181825",
			text: "#cdd6f4",
		},
	},
	{
		id: "gruvbox-dark",
		label: "Gruvbox Dark",
		description: "Retro groove dark palette with earthy contrast.",
		preview: {
			badgeBackground: "#1d2021",
			badgeBorder: "#3c3836",
			badgeText: "#fe8019",
			accent: "#83a598",
			surface: "#282828",
			surfaceAlt: "#3c3836",
			text: "#ebdbb2",
		},
	},
] as const satisfies readonly UiThemeOption<string>[];

export type UiLightThemeId = (typeof LIGHT_THEME_OPTIONS)[number]["id"];
export type UiDarkThemeId = (typeof DARK_THEME_OPTIONS)[number]["id"];

export const GLYPH_DEFAULT_LIGHT_THEME_ID: UiLightThemeId = "glyph-default";
export const GLYPH_DEFAULT_DARK_THEME_ID: UiDarkThemeId = "glyph-default-dark";

const LIGHT_THEME_IDS = new Set<UiLightThemeId>(
	LIGHT_THEME_OPTIONS.map((option) => option.id),
);
const DARK_THEME_IDS = new Set<UiDarkThemeId>(
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
	return typeof value === "string" &&
		LIGHT_THEME_IDS.has(value as UiLightThemeId)
		? (value as UiLightThemeId)
		: GLYPH_DEFAULT_LIGHT_THEME_ID;
}

export function asUiDarkThemeId(value: unknown): UiDarkThemeId {
	return typeof value === "string" && DARK_THEME_IDS.has(value as UiDarkThemeId)
		? (value as UiDarkThemeId)
		: GLYPH_DEFAULT_DARK_THEME_ID;
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
