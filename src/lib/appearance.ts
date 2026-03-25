import {
	MAX_EDITOR_FONT_SIZE,
	MIN_EDITOR_FONT_SIZE,
	type UiAccent,
	type UiFontFamily,
	type UiFontSize,
} from "./settings";
import {
	type UiDarkThemeId,
	type UiLightThemeId,
	asUiDarkThemeId,
	asUiLightThemeId,
} from "./uiThemes";

const BASE_TEXT_SIZES = {
	xs: 11,
	sm: 12,
	base: 14,
	md: 16,
	lg: 18,
	xl: 20,
	"2xl": 24,
	"3xl": 30,
} as const;

const BASE_EDITOR_TEXT_SIZES = {
	body: 16,
	inline: 13,
	raw: 12,
	h1: 25.28,
	h2: 20.48,
	h3: 17.28,
	h4: 16,
	h5: 14.8,
	h6: 13.6,
} as const;

const UI_ACCENT_COLORS: Record<UiAccent, string> = {
	neutral: "#2f2f2f",
	cerulean: "#0081a7",
	"tropical-teal": "#00afb9",
	"light-yellow": "#fdfcdc",
	"soft-apricot": "#fed9b7",
	"vibrant-coral": "#f07167",
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

function scaledEditorPx(px: number, scale: number): string {
	return `${Math.round(px * scale * 100) / 100}px`;
}

export function applyUiTypography(
	fontFamily: UiFontFamily,
	monoFontFamily: UiFontFamily,
	uiFontSize: UiFontSize,
	editorFontSize: UiFontSize,
): void {
	const root = document.documentElement;
	const safeFamily = fontFamily.trim() || "Inter";
	const safeMonoFamily = monoFontFamily.trim() || "JetBrains Mono";
	const uiScale = Math.max(0.5, Math.min(3, uiFontSize / 14));
	const editorScale = Math.max(
		MIN_EDITOR_FONT_SIZE / BASE_EDITOR_TEXT_SIZES.body,
		Math.min(
			MAX_EDITOR_FONT_SIZE / BASE_EDITOR_TEXT_SIZES.body,
			editorFontSize / 16,
		),
	);
	const rootRemPx = 16 * uiScale;

	// Scale rem-based typography globally so Tailwind/shadcn text sizes follow too.
	root.style.fontSize = `${Math.round(rootRemPx * 100) / 100}px`;
	root.style.setProperty(
		"--font-sans",
		`"${safeFamily}", -apple-system, BlinkMacSystemFont, sans-serif`,
	);
	root.style.setProperty(
		"--font-mono",
		`"${safeMonoFamily}", ui-monospace, SFMono-Regular, Menlo, monospace`,
	);
	root.style.setProperty("--text-xs", scaledPx(BASE_TEXT_SIZES.xs, uiScale));
	root.style.setProperty("--text-sm", scaledPx(BASE_TEXT_SIZES.sm, uiScale));
	root.style.setProperty(
		"--text-base",
		scaledPx(BASE_TEXT_SIZES.base, uiScale),
	);
	root.style.setProperty("--text-md", scaledPx(BASE_TEXT_SIZES.md, uiScale));
	root.style.setProperty("--text-lg", scaledPx(BASE_TEXT_SIZES.lg, uiScale));
	root.style.setProperty("--text-xl", scaledPx(BASE_TEXT_SIZES.xl, uiScale));
	root.style.setProperty(
		"--text-2xl",
		scaledPx(BASE_TEXT_SIZES["2xl"], uiScale),
	);
	root.style.setProperty(
		"--text-3xl",
		scaledPx(BASE_TEXT_SIZES["3xl"], uiScale),
	);
	root.style.setProperty(
		"--editor-font-size",
		scaledEditorPx(BASE_EDITOR_TEXT_SIZES.body, editorScale),
	);
	root.style.setProperty(
		"--editor-inline-font-size",
		scaledEditorPx(BASE_EDITOR_TEXT_SIZES.inline, editorScale),
	);
	root.style.setProperty(
		"--editor-raw-font-size",
		scaledEditorPx(BASE_EDITOR_TEXT_SIZES.raw, editorScale),
	);
	root.style.setProperty(
		"--editor-h1-font-size",
		scaledEditorPx(BASE_EDITOR_TEXT_SIZES.h1, editorScale),
	);
	root.style.setProperty(
		"--editor-h2-font-size",
		scaledEditorPx(BASE_EDITOR_TEXT_SIZES.h2, editorScale),
	);
	root.style.setProperty(
		"--editor-h3-font-size",
		scaledEditorPx(BASE_EDITOR_TEXT_SIZES.h3, editorScale),
	);
	root.style.setProperty(
		"--editor-h4-font-size",
		scaledEditorPx(BASE_EDITOR_TEXT_SIZES.h4, editorScale),
	);
	root.style.setProperty(
		"--editor-h5-font-size",
		scaledEditorPx(BASE_EDITOR_TEXT_SIZES.h5, editorScale),
	);
	root.style.setProperty(
		"--editor-h6-font-size",
		scaledEditorPx(BASE_EDITOR_TEXT_SIZES.h6, editorScale),
	);
}

export function applyUiAccent(accent: UiAccent): void {
	const root = document.documentElement;
	if (accent === "neutral") {
		root.style.removeProperty("--accent-color");
		root.style.removeProperty("--glyph-user-accent");
		root.style.removeProperty("--glyph-user-accent-hover");
		return;
	}
	const accentColor = UI_ACCENT_COLORS[accent] ?? UI_ACCENT_COLORS.cerulean;
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

export function applyUiDelightfulGlyph(enabled: boolean): void {
	const root = document.documentElement;
	root.dataset.delightfulGlyph = String(enabled);
}
