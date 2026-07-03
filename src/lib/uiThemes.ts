import type { UiAccent } from "./settings";
import { getAccentPreviewColor } from "./uiAccent";

export interface UiThemePreview {
	badgeBackground: string;
	badgeBorder: string;
	badgeText: string;
	surface: string;
	text: string;
}

export interface UiThemeOption<T extends string> {
	id: T;
	label: string;
	preview: UiThemePreview;
}

export const LIGHT_THEME_OPTIONS = [
	{
		id: "glyph-default",
		label: "Glyph",
		preview: {
			badgeBackground: "#f7f6f3",
			badgeBorder: "#e3e2de",
			badgeText: "#37352f",
			surface: "#ffffff",
			text: "#37352f",
		},
	},
	{
		id: "ayu-light",
		label: "Ayu",
		preview: {
			badgeBackground: "#fcfcfc",
			badgeBorder: "#d9d8d7",
			badgeText: "#ff9940",
			surface: "#fcfcfc",
			text: "#5c6773",
		},
	},
	{
		id: "catppuccin-latte",
		label: "Catppuccin Latte",
		preview: {
			badgeBackground: "#eff1f5",
			badgeBorder: "#ccd0da",
			badgeText: "#8839ef",
			surface: "#eff1f5",
			text: "#4c4f69",
		},
	},
	{
		id: "claude-light",
		label: "Claude",
		preview: {
			badgeBackground: "#faf3ef",
			badgeBorder: "#e8d5cc",
			badgeText: "#c96442",
			surface: "#faf9f5",
			text: "#141413",
		},
	},
	{
		id: "codex-light",
		label: "Codex",
		preview: {
			badgeBackground: "#e8f2fc",
			badgeBorder: "#b3d4f0",
			badgeText: "#0169cc",
			surface: "#ffffff",
			text: "#0d0d0d",
		},
	},
	{
		id: "everforest-light",
		label: "Everforest",
		preview: {
			badgeBackground: "#f1efe6",
			badgeBorder: "#d2cab7",
			badgeText: "#7f9b4e",
			surface: "#f6f2e8",
			text: "#475258",
		},
	},
	{
		id: "flexoki-light",
		label: "Flexoki Light",
		preview: {
			badgeBackground: "#F2F0E5",
			badgeBorder: "#CECDC3",
			badgeText: "#205EA6",
			surface: "#FFFCF0",
			text: "#100F0F",
		},
	},
	{
		id: "github-light",
		label: "GitHub",
		preview: {
			badgeBackground: "#ffffff",
			badgeBorder: "#d0d7de",
			badgeText: "#0969da",
			surface: "#ffffff",
			text: "#1f2328",
		},
	},
	{
		id: "gruvbox-light",
		label: "Gruvbox",
		preview: {
			badgeBackground: "#fbf1c7",
			badgeBorder: "#d5c4a1",
			badgeText: "#af3a03",
			surface: "#fbf1c7",
			text: "#3c3836",
		},
	},
	{
		id: "horizon-light",
		label: "Horizon Light",
		preview: {
			badgeBackground: "#fdf0ed",
			badgeBorder: "#f9cec3",
			badgeText: "#1d8991",
			surface: "#fdf0ed",
			text: "#403c3d",
		},
	},
	{
		id: "linear-light",
		label: "Linear",
		preview: {
			badgeBackground: "#f4f5fb",
			badgeBorder: "#d9dced",
			badgeText: "#5e6ad2",
			surface: "#f7f7f8",
			text: "#222530",
		},
	},
	{
		id: "nord-light",
		label: "Nord Light",
		preview: {
			badgeBackground: "#eceff4",
			badgeBorder: "#c4cad4",
			badgeText: "#5e81ac",
			surface: "#eceff4",
			text: "#2e3440",
		},
	},
	{
		id: "notion",
		label: "Notion",
		preview: {
			badgeBackground: "#f7f3ee",
			badgeBorder: "#ddd4c9",
			badgeText: "#2383c6",
			surface: "#ffffff",
			text: "#37352f",
		},
	},
	{
		id: "one-light",
		label: "One Light",
		preview: {
			badgeBackground: "#f6f7fb",
			badgeBorder: "#d8dde7",
			badgeText: "#4078f2",
			surface: "#fafafa",
			text: "#383a42",
		},
	},
	{
		id: "raycast-light",
		label: "Raycast",
		preview: {
			badgeBackground: "#fff1f1",
			badgeBorder: "#ffd4d4",
			badgeText: "#ff6363",
			surface: "#ffffff",
			text: "#030303",
		},
	},
	{
		id: "rose-pine-dawn",
		label: "Rose Pine Dawn",
		preview: {
			badgeBackground: "#faf4ed",
			badgeBorder: "#e1d0c8",
			badgeText: "#b4637a",
			surface: "#faf4ed",
			text: "#575279",
		},
	},
	{
		id: "solarized-light",
		label: "Solarized Light",
		preview: {
			badgeBackground: "#fdf6e3",
			badgeBorder: "#d9cda8",
			badgeText: "#b58900",
			surface: "#fdf6e3",
			text: "#586e75",
		},
	},
	{
		id: "tokyo-night-day",
		label: "Tokyo Night Day",
		preview: {
			badgeBackground: "#e9e9ed",
			badgeBorder: "#c7cbe0",
			badgeText: "#3760bf",
			surface: "#e1e2e7",
			text: "#3760bf",
		},
	},
	{
		id: "xcode-light",
		label: "Xcode",
		preview: {
			badgeBackground: "#f6f6f6",
			badgeBorder: "#d6d6d6",
			badgeText: "#0066cc",
			surface: "#ffffff",
			text: "#3d3d3d",
		},
	},
] as const satisfies readonly UiThemeOption<string>[];

export const DARK_THEME_OPTIONS = [
	{
		id: "glyph-default-dark",
		label: "Glyph",
		preview: {
			badgeBackground: "#252525",
			badgeBorder: "#3a3a3a",
			badgeText: "#e8e8e8",
			surface: "#191919",
			text: "#e8e8e8",
		},
	},
	{
		id: "ayu-dark",
		label: "Ayu Dark",
		preview: {
			badgeBackground: "#141821",
			badgeBorder: "#1b1f29",
			badgeText: "#e6b450",
			surface: "#10141c",
			text: "#bfbdb6",
		},
	},
	{
		id: "catppuccin-mocha",
		label: "Catppuccin Mocha",
		preview: {
			badgeBackground: "#181825",
			badgeBorder: "#313244",
			badgeText: "#cba6f7",
			surface: "#1e1e2e",
			text: "#cdd6f4",
		},
	},
	{
		id: "claude-dark",
		label: "Claude",
		preview: {
			badgeBackground: "#2a2420",
			badgeBorder: "#4a3830",
			badgeText: "#d97757",
			surface: "#141413",
			text: "#e8e6dc",
		},
	},
	{
		id: "codex-dark",
		label: "Codex",
		preview: {
			badgeBackground: "#1a2636",
			badgeBorder: "#2a3f5c",
			badgeText: "#4da3ff",
			surface: "#181818",
			text: "#ffffff",
		},
	},
	{
		id: "dracula",
		label: "Dracula",
		preview: {
			badgeBackground: "#181a24",
			badgeBorder: "#3a3752",
			badgeText: "#bd93f9",
			surface: "#282a36",
			text: "#f8f8f2",
		},
	},
	{
		id: "everforest-dark",
		label: "Everforest Dark",
		preview: {
			badgeBackground: "#2d353b",
			badgeBorder: "#475258",
			badgeText: "#a7c080",
			surface: "#2d353b",
			text: "#d3c6aa",
		},
	},
	{
		id: "flexoki-dark",
		label: "Flexoki Dark",
		preview: {
			badgeBackground: "#282726",
			badgeBorder: "#403E3C",
			badgeText: "#4385BE",
			surface: "#1C1B1A",
			text: "#CECDC3",
		},
	},
	{
		id: "github-dark",
		label: "GitHub Dark",
		preview: {
			badgeBackground: "#0d1117",
			badgeBorder: "#30363d",
			badgeText: "#58a6ff",
			surface: "#0d1117",
			text: "#e6edf3",
		},
	},
	{
		id: "gruvbox-dark",
		label: "Gruvbox Dark",
		preview: {
			badgeBackground: "#1d2021",
			badgeBorder: "#3c3836",
			badgeText: "#fe8019",
			surface: "#282828",
			text: "#ebdbb2",
		},
	},
	{
		id: "monokai",
		label: "Monokai",
		preview: {
			badgeBackground: "#1e1f1c",
			badgeBorder: "#414339",
			badgeText: "#f8f8f2",
			surface: "#272822",
			text: "#f8f8f2",
		},
	},
	{
		id: "night-owl",
		label: "Night Owl",
		preview: {
			badgeBackground: "#07111d",
			badgeBorder: "#16314c",
			badgeText: "#82aaff",
			surface: "#011627",
			text: "#d6deeb",
		},
	},
	{
		id: "nord-dark",
		label: "Nord Dark",
		preview: {
			badgeBackground: "#232833",
			badgeBorder: "#3f4858",
			badgeText: "#88c0d0",
			surface: "#2e3440",
			text: "#eceff4",
		},
	},
	{
		id: "one-dark",
		label: "One Dark",
		preview: {
			badgeBackground: "#151922",
			badgeBorder: "#2d3443",
			badgeText: "#61afef",
			surface: "#282c34",
			text: "#abb2bf",
		},
	},
	{
		id: "raycast-dark",
		label: "Raycast",
		preview: {
			badgeBackground: "#1f1010",
			badgeBorder: "#4a2828",
			badgeText: "#ff6363",
			surface: "#101010",
			text: "#fefefe",
		},
	},
	{
		id: "rose-pine-moon",
		label: "Rose Pine",
		preview: {
			badgeBackground: "#171521",
			badgeBorder: "#383154",
			badgeText: "#eb9cb4",
			surface: "#232136",
			text: "#e0def4",
		},
	},
	{
		id: "solarized-dark",
		label: "Solarized Dark",
		preview: {
			badgeBackground: "#001f27",
			badgeBorder: "#0b3b47",
			badgeText: "#ff4d4d",
			surface: "#002b36",
			text: "#93a1a1",
		},
	},
	{
		id: "tokyo-night",
		label: "Tokyo Night",
		preview: {
			badgeBackground: "#13141d",
			badgeBorder: "#28304a",
			badgeText: "#7dcfff",
			surface: "#1a1b26",
			text: "#c0caf5",
		},
	},
	{
		id: "xcode-dark",
		label: "Xcode",
		preview: {
			badgeBackground: "#34353b",
			badgeBorder: "#4a4b52",
			badgeText: "#6bdfff",
			surface: "#292a30",
			text: "#cecfd0",
		},
	},
	{
		id: "vesper",
		label: "Vesper",
		preview: {
			badgeBackground: "#101010",
			badgeBorder: "#505050",
			badgeText: "#FFC799",
			surface: "#101010",
			text: "#FFFFFF",
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

export function isGlyphDefaultThemeId(id: string): boolean {
	return (
		id === GLYPH_DEFAULT_LIGHT_THEME_ID || id === GLYPH_DEFAULT_DARK_THEME_ID
	);
}

export function getGlyphDefaultThemeId(
	mode: "light" | "dark",
): UiLightThemeId | UiDarkThemeId {
	return mode === "light"
		? GLYPH_DEFAULT_LIGHT_THEME_ID
		: GLYPH_DEFAULT_DARK_THEME_ID;
}

export function resolveGlyphDefaultThemePreview(
	preview: UiThemePreview,
	accent: UiAccent,
	mode: "light" | "dark",
): UiThemePreview {
	if (accent === "neutral") {
		return preview;
	}

	const accentColor = getAccentPreviewColor(accent, mode);
	return {
		...preview,
		badgeText: accentColor,
		badgeBackground: `color-mix(in srgb, ${accentColor} 14%, ${preview.surface})`,
		badgeBorder: `color-mix(in srgb, ${accentColor} 24%, ${preview.badgeBorder})`,
	};
}

export function resolveUiThemePreview<T extends string>(
	option: UiThemeOption<T>,
	mode: "light" | "dark",
	accent: UiAccent,
	resolvedColors?: { background: string; foreground: string },
): UiThemePreview {
	const preview = resolvedColors
		? {
				...option.preview,
				surface: resolvedColors.background,
				text: resolvedColors.foreground,
			}
		: option.preview;

	if (!isGlyphDefaultThemeId(option.id)) {
		return preview;
	}

	return resolveGlyphDefaultThemePreview(preview, accent, mode);
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
