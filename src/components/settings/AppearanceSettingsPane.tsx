import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import { applyUiAccent, applyUiTypography } from "../../lib/appearance";
import {
	type UiAccent,
	type ThemeMode,
	type UiFontFamily,
	type UiFontSize,
	loadSettings,
	setThemeMode,
	setUiAccent,
	setUiFontFamily,
	setUiFontSize,
	setUiMonoFontFamily,
} from "../../lib/settings";
import { AppearanceAccentCard } from "./AppearanceAccentCard";
import { AppearanceTypographyCard } from "./AppearanceTypographyCard";
import {
	DEFAULT_FONT_FAMILY,
	FONT_SIZE_OPTIONS,
	loadAvailableFonts,
	loadAvailableMonospaceFonts,
} from "./appearanceOptions";

export function AppearanceSettingsPane() {
	const { setTheme } = useTheme();
	const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
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

	return (
		<div className="settingsPane">
			<div className="settingsHero">
				<div>
					<h2>Appearance</h2>
					<p className="settingsHint">
						Adjust theme and typography for the app UI.
					</p>
				</div>
				<div className="settingsBadge">Visual</div>
			</div>
			{error ? <div className="settingsError">{error}</div> : null}
			<div className="settingsGrid">
				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Theme</div>
							<div className="settingsCardHint">
								Choose light, dark, or follow system preference.
							</div>
						</div>
					</div>
					<div className="settingsField">
						<div>
							<div className="settingsLabel">Mode</div>
						</div>
						<div
							className="settingsSegmented"
							role="tablist"
							aria-label="Theme mode"
						>
							<button
								type="button"
								className={themeMode === "light" ? "active" : ""}
								onClick={() => void onThemeModeChange("light")}
								aria-pressed={themeMode === "light"}
							>
								Light
							</button>
							<button
								type="button"
								className={themeMode === "dark" ? "active" : ""}
								onClick={() => void onThemeModeChange("dark")}
								aria-pressed={themeMode === "dark"}
							>
								Dark
							</button>
							<button
								type="button"
								className={themeMode === "system" ? "active" : ""}
								onClick={() => void onThemeModeChange("system")}
								aria-pressed={themeMode === "system"}
							>
								System
							</button>
						</div>
					</div>
				</section>
				<AppearanceAccentCard
					accent={accent}
					onAccentChange={onAccentChange}
				/>
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
