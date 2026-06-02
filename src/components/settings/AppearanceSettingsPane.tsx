import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import {
	applyUiAccent,
	applyUiSurfacePreferences,
	applyUiThemeSelection,
	applyUiTypography,
} from "../../lib/appearance";
import {
	type ThemeMode,
	type UiAccent,
	type UiDarkThemeId,
	type UiFontFamily,
	type UiFontSize,
	type UiLightThemeId,
	loadSettings,
	setThemeMode,
	setUiAccent,
	setUiDarkThemeId,
	setUiEditorFontSize,
	setUiFontFamily,
	setUiFontSize,
	setUiLightThemeId,
	setUiMonoFontFamily,
	setUiTranslucentApp,
} from "../../lib/settings";
import {
	DARK_THEME_OPTIONS,
	GLYPH_DEFAULT_DARK_THEME_ID,
	GLYPH_DEFAULT_LIGHT_THEME_ID,
	LIGHT_THEME_OPTIONS,
	asUiDarkThemeId,
	asUiLightThemeId,
	getUiDarkThemeOption,
	getUiLightThemeOption,
	isGlyphDefaultDarkTheme,
	isGlyphDefaultLightTheme,
} from "../../lib/uiThemes";
import { AppearanceAccentCard } from "./AppearanceAccentCard";
import { AppearanceThemeCard } from "./AppearanceThemeCard";
import { AppearanceTypographyCard } from "./AppearanceTypographyCard";
import {
	DEFAULT_FONT_FAMILY,
	EDITOR_FONT_SIZE_OPTIONS,
	UI_FONT_SIZE_OPTIONS,
	loadAvailableFonts,
	loadAvailableMonospaceFonts,
} from "./appearanceOptions";

export function AppearanceSettingsPane() {
	const { setTheme } = useTheme();
	const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
	const [lightThemeId, setLightThemeIdState] = useState<UiLightThemeId>(
		GLYPH_DEFAULT_LIGHT_THEME_ID,
	);
	const [darkThemeId, setDarkThemeIdState] = useState<UiDarkThemeId>(
		GLYPH_DEFAULT_DARK_THEME_ID,
	);
	const [accent, setAccentState] = useState<UiAccent>("neutral");
	const [fontFamily, setFontFamilyState] =
		useState<UiFontFamily>(DEFAULT_FONT_FAMILY);
	const [monoFontFamily, setMonoFontFamilyState] =
		useState<UiFontFamily>("JetBrains Mono");
	const [uiFontSize, setUiFontSizeState] = useState<UiFontSize>(14);
	const [editorFontSize, setEditorFontSizeState] = useState<UiFontSize>(16);
	const [translucentApp, setTranslucentAppState] = useState(false);
	const [availableFonts, setAvailableFonts] = useState<string[]>([
		DEFAULT_FONT_FAMILY,
	]);
	const [availableMonospaceFonts, setAvailableMonospaceFonts] = useState<
		string[]
	>(["JetBrains Mono"]);
	const [error, setError] = useState("");

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [settings, fonts, monoFonts] = await Promise.all([
					loadSettings(),
					loadAvailableFonts(),
					loadAvailableMonospaceFonts(),
				]);
				if (cancelled) return;
				setThemeModeState(settings.ui.theme);
				setLightThemeIdState(settings.ui.lightThemeId);
				setDarkThemeIdState(settings.ui.darkThemeId);
				setAccentState(settings.ui.accent);
				setFontFamilyState(settings.ui.fontFamily);
				setMonoFontFamilyState(settings.ui.monoFontFamily);
				setUiFontSizeState(settings.ui.fontSize);
				setEditorFontSizeState(settings.ui.editorFontSize);
				setTranslucentAppState(settings.ui.translucentApp);
				setAvailableFonts(
					fonts.includes(settings.ui.fontFamily)
						? fonts
						: [settings.ui.fontFamily, ...fonts],
				);
				setAvailableMonospaceFonts(
					monoFonts.includes(settings.ui.monoFontFamily)
						? monoFonts
						: [settings.ui.monoFontFamily, ...monoFonts],
				);
				setTheme(settings.ui.theme);
				applyUiThemeSelection(
					settings.ui.lightThemeId,
					settings.ui.darkThemeId,
				);
				applyUiAccent(settings.ui.accent);
				applyUiSurfacePreferences({
					translucentApp: settings.ui.translucentApp,
				});
				applyUiTypography(
					settings.ui.fontFamily,
					settings.ui.monoFontFamily,
					settings.ui.fontSize,
					settings.ui.editorFontSize,
				);
			} catch (e) {
				if (!cancelled) {
					setError(e instanceof Error ? e.message : "Failed to load settings");
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [setTheme]);

	const onThemeModeChange = useCallback(
		async (next: ThemeMode) => {
			setError("");
			setThemeModeState(next);
			setTheme(next);
			try {
				await setThemeMode(next);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[setTheme],
	);

	const onLightThemeChange = useCallback(
		async (next: UiLightThemeId | string) => {
			setError("");
			const previousLight = lightThemeId;
			const previousDark = darkThemeId;
			const normalizedNext = asUiLightThemeId(next);
			setLightThemeIdState(normalizedNext);
			applyUiThemeSelection(normalizedNext, previousDark);
			try {
				await setUiLightThemeId(normalizedNext);
			} catch (e) {
				setLightThemeIdState(previousLight);
				applyUiThemeSelection(previousLight, previousDark);
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[darkThemeId, lightThemeId],
	);

	const onDarkThemeChange = useCallback(
		async (next: UiDarkThemeId | string) => {
			setError("");
			const previousLight = lightThemeId;
			const previousDark = darkThemeId;
			const normalizedNext = asUiDarkThemeId(next);
			setDarkThemeIdState(normalizedNext);
			applyUiThemeSelection(previousLight, normalizedNext);
			try {
				await setUiDarkThemeId(normalizedNext);
			} catch (e) {
				setDarkThemeIdState(previousDark);
				applyUiThemeSelection(previousLight, previousDark);
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[darkThemeId, lightThemeId],
	);

	const onFontFamilyChange = useCallback(
		async (next: UiFontFamily) => {
			setError("");
			setFontFamilyState(next);
			applyUiTypography(next, monoFontFamily, uiFontSize, editorFontSize);
			try {
				await setUiFontFamily(next);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[editorFontSize, monoFontFamily, uiFontSize],
	);

	const onMonoFontFamilyChange = useCallback(
		async (next: UiFontFamily) => {
			setError("");
			setMonoFontFamilyState(next);
			applyUiTypography(fontFamily, next, uiFontSize, editorFontSize);
			try {
				await setUiMonoFontFamily(next);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[editorFontSize, fontFamily, uiFontSize],
	);

	const onUiFontSizeChange = useCallback(
		async (next: UiFontSize) => {
			setError("");
			setUiFontSizeState(next);
			applyUiTypography(fontFamily, monoFontFamily, next, editorFontSize);
			try {
				await setUiFontSize(next);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[editorFontSize, fontFamily, monoFontFamily],
	);

	const onEditorFontSizeChange = useCallback(
		async (next: UiFontSize) => {
			setError("");
			setEditorFontSizeState(next);
			applyUiTypography(fontFamily, monoFontFamily, uiFontSize, next);
			try {
				await setUiEditorFontSize(next);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[fontFamily, monoFontFamily, uiFontSize],
	);

	const onAccentChange = useCallback(async (next: UiAccent) => {
		setError("");
		setAccentState(next);
		applyUiAccent(next);
		try {
			await setUiAccent(next);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save settings");
		}
	}, []);

	const onTranslucentAppChange = useCallback(async (next: boolean) => {
		setError("");
		setTranslucentAppState(next);
		applyUiSurfacePreferences({ translucentApp: next });
		try {
			await setUiTranslucentApp(next);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save settings");
		}
	}, []);

	const showAccentCard =
		isGlyphDefaultLightTheme(lightThemeId) ||
		isGlyphDefaultDarkTheme(darkThemeId);
	const accentDescription =
		isGlyphDefaultLightTheme(lightThemeId) &&
		isGlyphDefaultDarkTheme(darkThemeId)
			? "Choose the accent used for highlights, focus rings, and emphasis in the default light and dark themes."
			: isGlyphDefaultLightTheme(lightThemeId)
				? "Choose the accent used for highlights, focus rings, and emphasis in the default light theme."
				: "Choose the accent used for highlights, focus rings, and emphasis in the default dark theme.";
	const lightTheme = getUiLightThemeOption(lightThemeId);
	const darkTheme = getUiDarkThemeOption(darkThemeId);

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}
			<div className="settingsGrid">
				<AppearanceThemeCard
					themeMode={themeMode}
					accent={accent}
					lightTheme={lightTheme}
					darkTheme={darkTheme}
					lightOptions={LIGHT_THEME_OPTIONS}
					darkOptions={DARK_THEME_OPTIONS}
					translucentApp={translucentApp}
					onThemeModeChange={onThemeModeChange}
					onLightThemeChange={onLightThemeChange}
					onDarkThemeChange={onDarkThemeChange}
					onTranslucentAppChange={onTranslucentAppChange}
				/>
				{showAccentCard ? (
					<AppearanceAccentCard
						accent={accent}
						description={accentDescription}
						onAccentChange={onAccentChange}
					/>
				) : null}
				<AppearanceTypographyCard
					fontFamily={fontFamily}
					monoFontFamily={monoFontFamily}
					uiFontSize={uiFontSize}
					editorFontSize={editorFontSize}
					availableFonts={availableFonts}
					availableMonospaceFonts={availableMonospaceFonts}
					uiFontSizeOptions={UI_FONT_SIZE_OPTIONS}
					editorFontSizeOptions={EDITOR_FONT_SIZE_OPTIONS}
					onFontFamilyChange={onFontFamilyChange}
					onMonoFontFamilyChange={onMonoFontFamilyChange}
					onUiFontSizeChange={onUiFontSizeChange}
					onEditorFontSizeChange={onEditorFontSizeChange}
				/>
			</div>
		</div>
	);
}
