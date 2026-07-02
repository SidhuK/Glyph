import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import {
	applyUiAccent,
	applyUiSurfacePreferences,
	applyUiThemeSelection,
} from "../../lib/appearance";
import {
	DEFAULT_UI_TRANSLUCENT_APP,
	type ThemeMode,
	type UiAccent,
	type UiDarkThemeId,
	type UiLightThemeId,
	loadSettings,
	setThemeMode,
	setUiAccent,
	setUiDarkThemeId,
	setUiLightThemeId,
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
import { AppearanceCornerRadiusCard } from "./AppearanceCornerRadiusCard";
import { AppearanceThemeCard } from "./AppearanceThemeCard";
import { AppearanceTypographyCard } from "./AppearanceTypographyCard";
import { useAppearanceCornerRadius } from "./useAppearanceCornerRadius";
import { useAppearanceTypography } from "./useAppearanceTypography";

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
	const [translucentApp, setTranslucentAppState] = useState(
		DEFAULT_UI_TRANSLUCENT_APP,
	);
	const [error, setError] = useState("");
	const { cornerRadiusStyle, onCornerRadiusStyleChange } =
		useAppearanceCornerRadius({ setError });
	const {
		fontFamily,
		editorFontFamily,
		monoFontFamily,
		uiFontSize,
		editorFontSize,
		availableFonts,
		availableMonospaceFonts,
		onFontFamilyChange,
		onEditorFontFamilyChange,
		onMonoFontFamilyChange,
		onUiFontSizeChange,
		onEditorFontSizeChange,
	} = useAppearanceTypography({ setError });

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const settings = await loadSettings();
				if (cancelled) return;
				setThemeModeState(settings.ui.theme);
				setLightThemeIdState(settings.ui.lightThemeId);
				setDarkThemeIdState(settings.ui.darkThemeId);
				setAccentState(settings.ui.accent);
				setTranslucentAppState(settings.ui.translucentApp);
				setTheme(settings.ui.theme);
				applyUiThemeSelection(
					settings.ui.lightThemeId,
					settings.ui.darkThemeId,
				);
				applyUiAccent(settings.ui.accent);
				applyUiSurfacePreferences({
					translucentApp: settings.ui.translucentApp,
				});
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
			? "Sets the accent for highlights, focus rings, and emphasis in the default light and dark themes."
			: isGlyphDefaultLightTheme(lightThemeId)
				? "Sets the accent for highlights, focus rings, and emphasis in the default light theme."
				: "Sets the accent for highlights, focus rings, and emphasis in the default dark theme.";
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
				<AppearanceCornerRadiusCard
					cornerRadiusStyle={cornerRadiusStyle}
					onCornerRadiusStyleChange={onCornerRadiusStyleChange}
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
					editorFontFamily={editorFontFamily}
					monoFontFamily={monoFontFamily}
					uiFontSize={uiFontSize}
					editorFontSize={editorFontSize}
					availableFonts={availableFonts}
					availableMonospaceFonts={availableMonospaceFonts}
					onFontFamilyChange={onFontFamilyChange}
					onEditorFontFamilyChange={onEditorFontFamilyChange}
					onMonoFontFamilyChange={onMonoFontFamilyChange}
					onUiFontSizeChange={onUiFontSizeChange}
					onEditorFontSizeChange={onEditorFontSizeChange}
				/>
			</div>
		</div>
	);
}
