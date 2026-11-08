import i18n from "i18next";
import type { UiThemeOption } from "./uiThemes";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const SHORT_HEX_COLOR_PATTERN = /^#[0-9a-f]{3}$/i;

/** Returns the canonical `#RRGGBB` form, or null when the value is not a hex color. */
function normalizeHexColor(value: string): string | null {
	const trimmed = value.trim();
	if (HEX_COLOR_PATTERN.test(trimmed)) return trimmed.toUpperCase();
	if (!SHORT_HEX_COLOR_PATTERN.test(trimmed)) return null;
	const [, r, g, b] = trimmed;
	return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
}

const CUSTOM_THEME_VERSION = 2;
const CUSTOM_THEME_ID_PREFIX = "custom:";
export const CUSTOM_THEME_STYLE_ELEMENT_ID = "glyphCustomThemes";
const MAX_CUSTOM_THEME_NAME_LENGTH = 40;

export type CustomUiThemeId = `${typeof CUSTOM_THEME_ID_PREFIX}${string}`;

/** Editable per-mode slots exposed in the exported JSON, in template order. */
const CUSTOM_THEME_TOKENS = [
	"background",
	"surface",
	"sidebar",
	"elevated",
	"canvas",
	"foreground",
	"border",
	"accent",
	"accentHover",
	"link",
	"selection",
	"success",
	"warning",
	"info",
	"danger",
] as const;

/** The signature palette every theme exposes as `--palette-<slot>`. */
export const CUSTOM_THEME_PALETTE_SLOTS = [
	"red",
	"orange",
	"yellow",
	"green",
	"cyan",
	"blue",
	"purple",
	"gray",
] as const;

type CustomThemeToken = (typeof CUSTOM_THEME_TOKENS)[number];
type CustomThemePaletteSlot = (typeof CUSTOM_THEME_PALETTE_SLOTS)[number];
type CustomThemeSwatches = Record<CustomThemePaletteSlot, string>;
export type CustomThemeColors = Record<CustomThemeToken, string> & {
	palette: CustomThemeSwatches;
};

export interface CustomTheme {
	version: typeof CUSTOM_THEME_VERSION;
	name: string;
	light: CustomThemeColors;
	dark: CustomThemeColors;
}

/** Mirrors the shipped Glyph light/dark themes so edits start from real values. */
const CUSTOM_THEME_TEMPLATE: CustomTheme = {
	version: CUSTOM_THEME_VERSION,
	name: "My Theme",
	light: {
		background: "#FFFFFF",
		surface: "#F7F6F3",
		sidebar: "#F7F6F3",
		elevated: "#F1F1EF",
		canvas: "#F5F5F4",
		foreground: "#37352F",
		border: "#E3E2DE",
		accent: "#3B5BDB",
		accentHover: "#2F4AC0",
		link: "#3B5BDB",
		selection: "#3B5BDB",
		success: "#5B7F12",
		warning: "#A16207",
		info: "#5145CD",
		danger: "#C2413B",
		palette: {
			red: "#C2413B",
			orange: "#C2570C",
			yellow: "#A16207",
			green: "#5B7F12",
			cyan: "#0E7490",
			blue: "#5145CD",
			purple: "#7C3AED",
			gray: "#78756D",
		},
	},
	dark: {
		background: "#212121",
		surface: "#171717",
		sidebar: "#171717",
		elevated: "#2B2B2B",
		canvas: "#171717",
		foreground: "#DCDCDC",
		border: "#383838",
		accent: "#8EA2FF",
		accentHover: "#B4C0FF",
		link: "#8EA2FF",
		selection: "#8EA2FF",
		success: "#A3E635",
		warning: "#FACC15",
		info: "#A5A0FF",
		danger: "#F87171",
		palette: {
			red: "#F87171",
			orange: "#FB923C",
			yellow: "#FACC15",
			green: "#A3E635",
			cyan: "#22D3EE",
			blue: "#A5A0FF",
			purple: "#C084FC",
			gray: "#A3A3A3",
		},
	},
};

export const CUSTOM_THEME_TEMPLATE_JSON = `${JSON.stringify(CUSTOM_THEME_TEMPLATE, null, 2)}\n`;

export function isCustomThemeId(value: unknown): value is CustomUiThemeId {
	return typeof value === "string" && value.startsWith(CUSTOM_THEME_ID_PREFIX);
}

export function customThemeSlug(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "");
}

export function customThemeId(name: string): CustomUiThemeId {
	return `${CUSTOM_THEME_ID_PREFIX}${customThemeSlug(name)}`;
}

function parseError(key: string, values?: Record<string, string | number>): Error {
	return new Error(i18n.t(`settings.appearance:customThemes.errors.${key}`, values));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(source: Record<string, unknown>, key: string, path: string) {
	const value = source[key];
	if (!isRecord(value)) throw parseError("missingGroup", { path });
	return value;
}

function hexReader(source: Record<string, unknown>, prefix: string) {
	return (key: string): string => {
		const raw = source[key];
		const hex = typeof raw === "string" ? normalizeHexColor(raw) : null;
		if (!hex) throw parseError("invalidColor", { path: `${prefix}.${key}` });
		return hex;
	};
}

function parseSwatches(source: Record<string, unknown>, prefix: string): CustomThemeSwatches {
	const hex = hexReader(source, prefix);
	return {
		red: hex("red"),
		orange: hex("orange"),
		yellow: hex("yellow"),
		green: hex("green"),
		cyan: hex("cyan"),
		blue: hex("blue"),
		purple: hex("purple"),
		gray: hex("gray"),
	};
}

function parseColors(theme: Record<string, unknown>, mode: "light" | "dark"): CustomThemeColors {
	const source = readRecord(theme, mode, mode);
	const hex = hexReader(source, mode);
	return {
		background: hex("background"),
		surface: hex("surface"),
		sidebar: hex("sidebar"),
		elevated: hex("elevated"),
		canvas: hex("canvas"),
		foreground: hex("foreground"),
		border: hex("border"),
		accent: hex("accent"),
		accentHover: hex("accentHover"),
		link: hex("link"),
		selection: hex("selection"),
		success: hex("success"),
		warning: hex("warning"),
		info: hex("info"),
		danger: hex("danger"),
		palette: parseSwatches(readRecord(source, "palette", `${mode}.palette`), `${mode}.palette`),
	};
}

/** Validates untrusted JSON (file import or persisted settings) into a theme. */
export function parseCustomTheme(value: unknown): CustomTheme {
	if (!isRecord(value)) throw parseError("notObject");
	if (value.version === 1) throw parseError("legacyVersion");
	if (value.version !== CUSTOM_THEME_VERSION) {
		throw parseError("unsupportedVersion", { version: CUSTOM_THEME_VERSION });
	}
	const name = typeof value.name === "string" ? value.name.trim() : "";
	if (!name || name.length > MAX_CUSTOM_THEME_NAME_LENGTH || !customThemeSlug(name)) {
		throw parseError("invalidName", { max: MAX_CUSTOM_THEME_NAME_LENGTH });
	}
	return {
		version: CUSTOM_THEME_VERSION,
		name,
		light: parseColors(value, "light"),
		dark: parseColors(value, "dark"),
	};
}

/** Load-time normalization: unreadable or older-format entries are dropped. */
export function normalizeCustomThemes(value: unknown): CustomTheme[] {
	if (!Array.isArray(value)) return [];
	const byId = new Map<string, CustomTheme>();
	for (const entry of value) {
		try {
			const theme = parseCustomTheme(entry);
			byId.set(customThemeId(theme.name), theme);
		} catch {
			// persisted v1 or corrupt entries are dropped; imports surface the parse error instead
		}
	}
	return [...byId.values()];
}

function customThemeOption(theme: CustomTheme): UiThemeOption<CustomUiThemeId> {
	return {
		id: customThemeId(theme.name),
		label: theme.name,
	};
}

export function customThemeOptions(
	themes: readonly CustomTheme[],
): UiThemeOption<CustomUiThemeId>[] {
	return themes.map(customThemeOption);
}
