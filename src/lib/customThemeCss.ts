import {
	CUSTOM_THEME_PALETTE_SLOTS,
	CUSTOM_THEME_STYLE_ELEMENT_ID,
	type CustomTheme,
	type CustomThemeColors,
	customThemeId,
} from "./customThemes";

type ThemeMode = "light" | "dark";

/** Selection is authored as a solid hue; each mode applies its own translucency. */
const SELECTION_OPACITY: Record<ThemeMode, number> = { light: 24, dark: 40 };

function mix(color: string, percent: number, into: string): string {
	return `color-mix(in srgb, ${color} ${percent}%, ${into})`;
}

function surfaceVariables(colors: CustomThemeColors, mode: ThemeMode): Array<[string, string]> {
	const { background, surface, sidebar, elevated, canvas, foreground, border } = colors;
	const { accent, accentHover, link, selection } = colors;
	return [
		["--bg-primary", background],
		["--bg-secondary", surface],
		["--bg-sidebar", sidebar],
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
		["--border-default", border],
		["--border-light", mix(border, 55, "transparent")],
		["--border-strong", mix(border, 60, foreground)],
		["--border-focus", mix(accent, 45, "transparent")],
		["--interactive-accent", accent],
		["--interactive-accent-hover", accentHover],
		["--accent-color", accent],
		["--link-color", link],
		["--link-color-hover", mix(link, 80, foreground)],
		["--text-selection", mix(selection, SELECTION_OPACITY[mode], "transparent")],
		["--selection-bg-muted", mix(accent, 14, "transparent")],
		["--scrollbar-thumb", mix(foreground, 16, "transparent")],
		["--scrollbar-thumb-hover", mix(foreground, 28, "transparent")],
		["--glass-bg", mix(background, 82, "transparent")],
	];
}

/** Status, callout, inline-color and AI tokens all derive from the status colors and palette. */
function semanticVariables(colors: CustomThemeColors): Array<[string, string]> {
	const { background, success, warning, info, danger, palette } = colors;
	return [
		...CUSTOM_THEME_PALETTE_SLOTS.map((slot): [string, string] => [
			`--palette-${slot}`,
			palette[slot],
		]),
		["--text-error", danger],
		["--feedback-error-bg", mix(danger, 14, background)],
		["--status-info-fg", info],
		["--status-success-fg", success],
		["--status-success-bg", mix(success, 14, "transparent")],
		["--status-warning-fg", warning],
		["--status-danger-fg", danger],
		["--status-danger-bg", mix(danger, 12, "transparent")],
		["--status-danger-border", mix(danger, 36, "transparent")],
		["--callout-info", info],
		["--callout-tip", success],
		["--callout-warning", warning],
		["--callout-error", danger],
		["--ai-accent-chat", palette.blue],
		["--ai-accent-create", palette.red],
		["--glyph-inline-color-gray", palette.gray],
		["--glyph-inline-color-brown", `color-mix(in oklab, ${palette.orange} 58%, ${palette.gray})`],
		["--glyph-inline-color-orange", palette.orange],
		["--glyph-inline-color-yellow", palette.yellow],
		["--glyph-inline-color-green", palette.green],
		["--glyph-inline-color-blue", palette.blue],
		["--glyph-inline-color-purple", palette.purple],
		["--glyph-inline-color-red", palette.red],
		["--glyph-inline-highlight-yellow", mix(warning, 24, "transparent")],
		["--glyph-inline-highlight-blue", mix(info, 20, "transparent")],
		["--glyph-inline-highlight-green", mix(success, 22, "transparent")],
		["--glyph-inline-highlight-red", mix(danger, 18, "transparent")],
	];
}

function themeRule(theme: CustomTheme, mode: ThemeMode): string {
	const id = customThemeId(theme.name);
	const colors = theme[mode];
	const declarations = [...surfaceVariables(colors, mode), ...semanticVariables(colors)]
		.map(([property, value]) => `\t${property}: ${value};`)
		.join("\n");
	return `:where(:root, .appearanceThemePreview).${mode}[data-${mode}-theme="${id}"] {\n${declarations}\n}`;
}

function buildCustomThemeCss(themes: readonly CustomTheme[]): string {
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
