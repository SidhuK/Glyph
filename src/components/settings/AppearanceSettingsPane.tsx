import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import {
	applyUiAccent,
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
	setUiFontFamily,
	setUiFontSize,
	setUiLightThemeId,
	setUiMonoFontFamily,
} from "../../lib/settings";
import {
	DARK_THEME_OPTIONS,
	GLYPH_DEFAULT_DARK_THEME_ID,
	GLYPH_DEFAULT_LIGHT_THEME_ID,
	LIGHT_THEME_OPTIONS,
	isGlyphDefaultDarkTheme,
	isGlyphDefaultLightTheme,
} from "../../lib/uiThemes";
import { AppearanceAccentCard } from "./AppearanceAccentCard";
import { AppearanceTypographyCard } from "./AppearanceTypographyCard";
import {
	SettingsRow,
	SettingsSection,
	SettingsSegmented,
} from "./SettingsScaffold";
import {
	DEFAULT_FONT_FAMILY,
	FONT_SIZE_OPTIONS,
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
	const [fontSize, setFontSizeState] = useState<UiFontSize>(14);
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
				setFontSizeState(settings.ui.fontSize);
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
				applyUiTypography(
					settings.ui.fontFamily,
					settings.ui.monoFontFamily,
					settings.ui.fontSize,
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
		async (next: UiLightThemeId) => {
			setError("");
			setLightThemeIdState(next);
			applyUiThemeSelection(next, darkThemeId);
			try {
				await setUiLightThemeId(next);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[darkThemeId],
	);

	const onDarkThemeChange = useCallback(
		async (next: UiDarkThemeId) => {
			setError("");
			setDarkThemeIdState(next);
			applyUiThemeSelection(lightThemeId, next);
			try {
				await setUiDarkThemeId(next);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[lightThemeId],
	);

	const onFontFamilyChange = useCallback(
		async (next: UiFontFamily) => {
			setError("");
			setFontFamilyState(next);
			applyUiTypography(next, monoFontFamily, fontSize);
			try {
				await setUiFontFamily(next);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[fontSize, monoFontFamily],
	);

	const onMonoFontFamilyChange = useCallback(
		async (next: UiFontFamily) => {
			setError("");
			setMonoFontFamilyState(next);
			applyUiTypography(fontFamily, next, fontSize);
			try {
				await setUiMonoFontFamily(next);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[fontFamily, fontSize],
	);

	const onFontSizeChange = useCallback(
		async (next: UiFontSize) => {
			setError("");
			setFontSizeState(next);
			applyUiTypography(fontFamily, monoFontFamily, next);
			try {
				await setUiFontSize(next);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[fontFamily, monoFontFamily],
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

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}
			<div className="settingsGrid">
				<SettingsSection
					title="Theme"
					description="Choose the overall mode Glyph should follow."
				>
					<SettingsRow
						label="Color mode"
						description="Light and dark are fixed. System follows your OS preference."
					>
						<SettingsSegmented<ThemeMode>
							ariaLabel="Theme mode"
							value={themeMode}
							onChange={(value) => void onThemeModeChange(value)}
							options={[
								{ label: "Light", value: "light" },
								{ label: "Dark", value: "dark" },
								{ label: "System", value: "system" },
							]}
						/>
					</SettingsRow>
					<SettingsRow
						label="Light theme"
						htmlFor="settingsLightTheme"
						description="Choose the theme family Glyph should use whenever the app resolves to light mode."
					>
						<select
							id="settingsLightTheme"
							value={lightThemeId}
							onChange={(event) =>
								void onLightThemeChange(event.target.value as UiLightThemeId)
							}
						>
							{LIGHT_THEME_OPTIONS.map((option) => (
								<option key={option.id} value={option.id}>
									{option.label}
								</option>
							))}
						</select>
					</SettingsRow>
					<SettingsRow
						label="Dark theme"
						htmlFor="settingsDarkTheme"
						description="Choose the theme family Glyph should use whenever the app resolves to dark mode."
					>
						<select
							id="settingsDarkTheme"
							value={darkThemeId}
							onChange={(event) =>
								void onDarkThemeChange(event.target.value as UiDarkThemeId)
							}
						>
							{DARK_THEME_OPTIONS.map((option) => (
								<option key={option.id} value={option.id}>
									{option.label}
								</option>
							))}
						</select>
					</SettingsRow>
				</SettingsSection>
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
					fontSize={fontSize}
					availableFonts={availableFonts}
					availableMonospaceFonts={availableMonospaceFonts}
					fontSizeOptions={FONT_SIZE_OPTIONS}
					onFontFamilyChange={onFontFamilyChange}
					onMonoFontFamilyChange={onMonoFontFamilyChange}
					onFontSizeChange={onFontSizeChange}
				/>
			</div>
		</div>
	);
}
