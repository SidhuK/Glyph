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

export const CUSTOM_THEME_ID_PREFIX = "custom:";
export const CUSTOM_THEME_STYLE_ELEMENT_ID = "glyphCustomThemes";
export const MAX_CUSTOM_THEME_NAME_LENGTH = 40;

export type CustomUiThemeId = `${typeof CUSTOM_THEME_ID_PREFIX}${string}`;

/** Editable slots exposed in the exported JSON, in template order. */
export const CUSTOM_THEME_TOKENS = [
	"background",
	"surface",
	"elevated",
	"canvas",
	"foreground",
	"border",
	"accent",
	"accentHover",
	"link",
	"danger",
] as const;

export type CustomThemeToken = (typeof CUSTOM_THEME_TOKENS)[number];
export type CustomThemePalette = Record<CustomThemeToken, string>;

export interface CustomTheme {
	version: 1;
	name: string;
	light: CustomThemePalette;
	dark: CustomThemePalette;
}

/** Mirrors the shipped Glyph light/dark palettes so edits start from real values. */
export const CUSTOM_THEME_TEMPLATE: CustomTheme = {
	version: 1,
	name: "My Theme",
	light: {
		background: "#FFFFFF",
		surface: "#F7F6F3",
		elevated: "#F1F1EF",
		canvas: "#F5F5F4",
		foreground: "#37352F",
		border: "#E3E2DE",
		accent: "#37352F",
		accentHover: "#1F1F1F",
		link: "#2563EB",
		danger: "#DC2626",
	},
	dark: {
		background: "#191919",
		surface: "#252525",
		elevated: "#2F2F2F",
		canvas: "#141414",
		foreground: "#E8E8E8",
		border: "#333333",
		accent: "#E8E8E8",
		accentHover: "#FFFFFF",
		link: "#93C5FD",
		danger: "#EF4444",
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

function parsePalette(
	value: unknown,
	mode: "light" | "dark",
): CustomThemePalette {
	if (!value || typeof value !== "object") {
		throw new Error(`Missing "${mode}" colors`);
	}
	const source = value as Record<string, unknown>;
	const palette = {} as CustomThemePalette;
	for (const token of CUSTOM_THEME_TOKENS) {
		const raw = source[token];
		const hex = typeof raw === "string" ? normalizeHexColor(raw) : null;
		if (!hex) {
			throw new Error(`"${mode}.${token}" must be a hex color like #1A2B3C`);
		}
		palette[token] = hex;
	}
	return palette;
}

/** Validates untrusted JSON (file import or persisted settings) into a theme. */
export function parseCustomTheme(value: unknown): CustomTheme {
	if (!value || typeof value !== "object") {
		throw new Error("Theme file must contain a JSON object");
	}
	const source = value as Partial<CustomTheme>;
	if (source.version !== 1) {
		throw new Error('Theme file must set "version": 1');
	}
	const name = typeof source.name === "string" ? source.name.trim() : "";
	if (!name || name.length > MAX_CUSTOM_THEME_NAME_LENGTH) {
		throw new Error(
			`"name" must be 1-${MAX_CUSTOM_THEME_NAME_LENGTH} characters`,
		);
	}
	if (!customThemeSlug(name)) {
		throw new Error('"name" must contain letters or numbers');
	}
	return {
		version: 1,
		name,
		light: parsePalette(source.light, "light"),
		dark: parsePalette(source.dark, "dark"),
	};
}

export function normalizeCustomThemes(value: unknown): CustomTheme[] {
	if (!Array.isArray(value)) return [];
	const byId = new Map<string, CustomTheme>();
	for (const entry of value) {
		try {
			const theme = parseCustomTheme(entry);
			byId.set(customThemeId(theme.name), theme);
		} catch {
			// drop unreadable entries instead of breaking appearance settings
		}
	}
	return [...byId.values()];
}

function mix(color: string, percent: number, into: string): string {
	return `color-mix(in srgb, ${color} ${percent}%, ${into})`;
}

/** Full variable set for one mode: explicit tokens plus values derived from them. */
function paletteVariables(
	palette: CustomThemePalette,
): Array<[string, string]> {
	const { background, surface, elevated, canvas, foreground, border } = palette;
	const { accent, accentHover, link, danger } = palette;
	return [
		["--bg-primary", background],
		["--bg-secondary", surface],
		["--bg-sidebar", surface],
		["--bg-tertiary", elevated],
		["--bg-canvas", canvas],
		["--bg-hover", mix(foreground, 8, "transparent")],
		["--bg-active", mix(foreground, 14, "transparent")],
		["--interactive-hover", mix(foreground, 8, "transparent")],
		["--text-primary", foreground],
		["--text-secondary", mix(foreground, 68, background)],
		["--text-tertiary", mix(foreground, 45, background)],
		["--text-placeholder", mix(foreground, 35, background)],
		["--text-inverse", background],
		["--text-accent", accent],
		["--text-error", danger],
		["--border-default", border],
		["--border-light", mix(border, 55, "transparent")],
		["--border-strong", mix(border, 60, foreground)],
		["--border-focus", mix(accent, 45, "transparent")],
		["--interactive-accent", accent],
		["--interactive-accent-hover", accentHover],
		["--accent-color", accent],
		["--link-color", link],
		["--link-color-hover", mix(link, 80, foreground)],
		["--selection-bg-muted", mix(accent, 14, "transparent")],
		["--scrollbar-thumb", mix(foreground, 16, "transparent")],
		["--scrollbar-thumb-hover", mix(foreground, 28, "transparent")],
		["--glass-bg", mix(background, 82, "transparent")],
		["--feedback-error-bg", mix(danger, 14, background)],
		["--status-danger-fg", danger],
		["--status-danger-bg", mix(danger, 12, "transparent")],
		["--status-danger-border", mix(danger, 36, "transparent")],
	];
}

function themeRule(theme: CustomTheme, mode: "light" | "dark"): string {
	const id = customThemeId(theme.name);
	const declarations = paletteVariables(theme[mode])
		.map(([property, value]) => `\t${property}: ${value};`)
		.join("\n");
	return `:root.${mode}[data-${mode}-theme="${id}"] {\n${declarations}\n}`;
}

export function buildCustomThemeCss(themes: readonly CustomTheme[]): string {
	return themes
		.flatMap((theme) => [themeRule(theme, "light"), themeRule(theme, "dark")])
		.join("\n\n");
}

/** Keeps a single stylesheet in sync with the persisted custom themes. */
export function applyCustomThemes(themes: readonly CustomTheme[]): void {
	const existing = document.getElementById(CUSTOM_THEME_STYLE_ELEMENT_ID);
	const style =
		existing instanceof HTMLStyleElement
			? existing
			: document.head.appendChild(document.createElement("style"));
	style.id = CUSTOM_THEME_STYLE_ELEMENT_ID;
	style.textContent = buildCustomThemeCss(themes);
}

export function customThemeOption(
	theme: CustomTheme,
	mode: "light" | "dark",
): UiThemeOption<CustomUiThemeId> {
	const palette = theme[mode];
	return {
		id: customThemeId(theme.name),
		label: theme.name,
		preview: {
			badgeBackground: palette.surface,
			badgeBorder: palette.border,
			badgeText: palette.accent,
			surface: palette.background,
			text: palette.foreground,
		},
	};
}

export function customThemeOptions(
	themes: readonly CustomTheme[],
	mode: "light" | "dark",
): UiThemeOption<CustomUiThemeId>[] {
	return themes.map((theme) => customThemeOption(theme, mode));
}
