import {
	type EditorWidthMode,
	MAX_EDITOR_FONT_SIZE,
	MIN_EDITOR_FONT_SIZE,
	type UiAccent,
	type UiCornerRadiusStyle,
	type UiFontFamily,
	type UiFontSize,
	isUiAccent,
} from "./settings";
import {
	type UiDarkThemeId,
	type UiLightThemeId,
	asUiDarkThemeId,
	asUiLightThemeId,
} from "./uiThemes";

const BASE_SPACE_SIZES = {
	1: 4,
	2: 8,
	3: 12,
	4: 16,
	5: 20,
	6: 24,
	8: 32,
} as const;

const BASE_LAYOUT_SIZES = {
	headerHeight: 48,
	buttonHeight: 32,
	buttonHeightSm: 26,
	inputHeight: 32,
} as const;

const BASE_EDITOR_FONT_SIZE = 16;
const DERIVED_EDITOR_FONT_SIZE_PROPERTIES = [
	"--editor-inline-font-size",
	"--editor-raw-font-size",
	"--editor-h1-font-size",
	"--editor-h2-font-size",
	"--editor-h3-font-size",
	"--editor-h4-font-size",
	"--editor-h5-font-size",
	"--editor-h6-font-size",
] as const;
const DERIVED_UI_FONT_SIZE_PROPERTIES = [
	"--text-xs",
	"--text-sm",
	"--text-base",
	"--text-md",
] as const;

const UI_ACCENT_COLORS: Record<Exclude<UiAccent, "neutral">, string> = {
	"glyph-orange": "#de7356",
	"glyph-red": "#e84d42",
	cerulean: "#0081a7",
	"tropical-teal": "#00afb9",
};

function clampColorChannel(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)));
}

function shiftHexColor(hex: string, amount: number): string {
	const clean = hex.replace("#", "");
	const r = Number.parseInt(clean.slice(0, 2), 16);
	const g = Number.parseInt(clean.slice(2, 4), 16);
	const b = Number.parseInt(clean.slice(4, 6), 16);
	const nextR = clampColorChannel(r + amount);
	const nextG = clampColorChannel(g + amount);
	const nextB = clampColorChannel(b + amount);
	return `#${nextR.toString(16).padStart(2, "0")}${nextG.toString(16).padStart(2, "0")}${nextB.toString(16).padStart(2, "0")}`;
}

function scaledPx(px: number, scale: number): string {
	return `${Math.round(px * scale)}px`;
}

function getCompactDisplayBoost(): number {
	if (typeof window === "undefined" || !window.screen) return 1;
	const availableWidth = Number(window.screen.availWidth);
	if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1;
	// 1366 and 1512 are practical breakpoints for common laptop and compact
	// desktop display widths where slightly larger UI text improves readability.
	if (availableWidth <= 1366) return 1.12;
	if (availableWidth <= 1512) return 1.08;
	return 1;
}

export interface UiTypographyPreferences {
	fontFamily: UiFontFamily;
	editorFontFamily: UiFontFamily;
	monoFontFamily: UiFontFamily;
	uiFontSize: UiFontSize;
	editorFontSize: UiFontSize;
}

export function applyUiTypography({
	fontFamily,
	editorFontFamily,
	monoFontFamily,
	uiFontSize,
	editorFontSize,
}: UiTypographyPreferences): void {
	const root = document.documentElement;
	const safeFamily = fontFamily.trim() || "Geist";
	const safeEditorFamily = editorFontFamily.trim() || safeFamily;
	const safeMonoFamily = monoFontFamily.trim() || "JetBrains Mono";
	const uiScale = Math.max(0.5, Math.min(3, uiFontSize / 14));
	const compactDisplayBoost = getCompactDisplayBoost();
	const effectiveUiScale = Math.max(
		0.5,
		Math.min(3, uiScale * compactDisplayBoost),
	);
	const safeEditorFontSize = Math.max(
		MIN_EDITOR_FONT_SIZE,
		Math.min(
			MAX_EDITOR_FONT_SIZE,
			Math.round(
				Number.isFinite(editorFontSize)
					? editorFontSize
					: BASE_EDITOR_FONT_SIZE,
			),
		),
	);
	const rootRemPx = 16 * effectiveUiScale;

	// Scale rem-based typography globally so Tailwind/shadcn text sizes follow too.
	root.style.fontSize = `${Math.round(rootRemPx * 100) / 100}px`;
	root.style.setProperty(
		"--font-sans",
		`"${safeFamily}", "Inter", -apple-system, BlinkMacSystemFont, sans-serif`,
	);
	root.style.setProperty(
		"--font-editor",
		`"${safeEditorFamily}", "${safeFamily}", "Inter", -apple-system, BlinkMacSystemFont, sans-serif`,
	);
	root.style.setProperty(
		"--font-mono",
		`"${safeMonoFamily}", ui-monospace, SFMono-Regular, Menlo, monospace`,
	);
	for (const property of DERIVED_UI_FONT_SIZE_PROPERTIES) {
		root.style.removeProperty(property);
	}
	root.style.setProperty(
		"--space-1",
		scaledPx(BASE_SPACE_SIZES[1], effectiveUiScale),
	);
	root.style.setProperty(
		"--space-2",
		scaledPx(BASE_SPACE_SIZES[2], effectiveUiScale),
	);
	root.style.setProperty(
		"--space-3",
		scaledPx(BASE_SPACE_SIZES[3], effectiveUiScale),
	);
	root.style.setProperty(
		"--space-4",
		scaledPx(BASE_SPACE_SIZES[4], effectiveUiScale),
	);
	root.style.setProperty(
		"--space-5",
		scaledPx(BASE_SPACE_SIZES[5], effectiveUiScale),
	);
	root.style.setProperty(
		"--space-6",
		scaledPx(BASE_SPACE_SIZES[6], effectiveUiScale),
	);
	root.style.setProperty(
		"--space-8",
		scaledPx(BASE_SPACE_SIZES[8], effectiveUiScale),
	);
	root.style.setProperty(
		"--header-height",
		scaledPx(BASE_LAYOUT_SIZES.headerHeight, effectiveUiScale),
	);
	root.style.setProperty(
		"--button-height",
		scaledPx(BASE_LAYOUT_SIZES.buttonHeight, effectiveUiScale),
	);
	root.style.setProperty(
		"--button-height-sm",
		scaledPx(BASE_LAYOUT_SIZES.buttonHeightSm, effectiveUiScale),
	);
	root.style.setProperty(
		"--input-height",
		scaledPx(BASE_LAYOUT_SIZES.inputHeight, effectiveUiScale),
	);
	root.style.setProperty("--editor-font-size", `${safeEditorFontSize}px`);
	for (const property of DERIVED_EDITOR_FONT_SIZE_PROPERTIES) {
		root.style.removeProperty(property);
	}
}

export function applyUiCornerRadius(style: UiCornerRadiusStyle): void {
	const root = document.documentElement;
	if (style === "default") {
		delete root.dataset.cornerRadiusStyle;
		return;
	}
	root.dataset.cornerRadiusStyle = style;
}

export function applyUiAccent(
	accent: UiAccent | string | null | undefined,
): void {
	const root = document.documentElement;
	if (!isUiAccent(accent) || accent === "neutral") {
		root.style.removeProperty("--accent-color");
		root.style.removeProperty("--glyph-user-accent");
		root.style.removeProperty("--glyph-user-accent-hover");
		return;
	}
	const accentColor = UI_ACCENT_COLORS[accent];
	root.style.setProperty("--glyph-user-accent", accentColor);
	root.style.setProperty(
		"--glyph-user-accent-hover",
		shiftHexColor(accentColor, -18),
	);
}

export function applyUiThemeSelection(
	lightThemeId: UiLightThemeId | string | null | undefined,
	darkThemeId: UiDarkThemeId | string | null | undefined,
): void {
	const root = document.documentElement;
	root.dataset.lightTheme = asUiLightThemeId(lightThemeId);
	root.dataset.darkTheme = asUiDarkThemeId(darkThemeId);
}

export function applyUiSurfacePreferences(options: {
	translucentApp: boolean;
}): void {
	const root = document.documentElement;
	root.dataset.translucentSidebar = String(options.translucentApp);
	root.dataset.translucentAppFrame = String(options.translucentApp);
	root.dataset.translucentAiPanel = String(options.translucentApp);
}

export function applyEditorWidthMode(mode: EditorWidthMode): void {
	const root = document.documentElement;

	if (mode === "wide") {
		root.style.setProperty("--editor-readable-content-max-width", "100%");
		root.style.setProperty("--editor-readable-content-gutter", "0px");
		root.style.setProperty("--editor-readable-content-gutter-compact", "0px");
		return;
	}

	if (mode === "comfortable") {
		root.style.setProperty("--editor-readable-content-max-width", "860px");
		root.style.setProperty(
			"--editor-readable-content-gutter",
			"clamp(14px, 3vw, 36px)",
		);
		root.style.setProperty(
			"--editor-readable-content-gutter-compact",
			"clamp(10px, 2.4vw, 22px)",
		);
		return;
	}

	root.style.removeProperty("--editor-readable-content-max-width");
	root.style.removeProperty("--editor-readable-content-gutter");
	root.style.removeProperty("--editor-readable-content-gutter-compact");
}
