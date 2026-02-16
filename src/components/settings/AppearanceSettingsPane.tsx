import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import { applyUiTypography } from "../../lib/appearance";
import {
	type ThemeMode,
	type UiFontFamily,
	type UiFontSize,
	loadSettings,
	setThemeMode,
	setUiFontFamily,
	setUiFontSize,
} from "../../lib/settings";
import { AppearanceTypographyCard } from "./AppearanceTypographyCard";
import {
	DEFAULT_FONT_FAMILY,
	FONT_SIZE_OPTIONS,
	loadAvailableFonts,
} from "./appearanceOptions";

export function AppearanceSettingsPane() {
	const { setTheme } = useTheme();
	const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
	const [fontFamily, setFontFamilyState] =
		useState<UiFontFamily>(DEFAULT_FONT_FAMILY);
	const [fontSize, setFontSizeState] = useState<UiFontSize>(14);
	const [availableFonts, setAvailableFonts] = useState<string[]>([
		DEFAULT_FONT_FAMILY,
	]);
	const [error, setError] = useState("");

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [settings, fonts] = await Promise.all([
					loadSettings(),
					loadAvailableFonts(),
				]);
				if (cancelled) return;
				setThemeModeState(settings.ui.theme);
				setFontFamilyState(settings.ui.fontFamily);
				setFontSizeState(settings.ui.fontSize);
				setAvailableFonts(
					fonts.includes(settings.ui.fontFamily)
						? fonts
						: [settings.ui.fontFamily, ...fonts],
				);
				setTheme(settings.ui.theme);
				applyUiTypography(settings.ui.fontFamily, settings.ui.fontSize);
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
			applyUiTypography(next, fontSize);
			try {
				await setUiFontFamily(next);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[fontSize],
	);

	const onFontSizeChange = useCallback(
		async (next: UiFontSize) => {
			setError("");
			setFontSizeState(next);
			applyUiTypography(fontFamily, next);
			try {
				await setUiFontSize(next);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[fontFamily],
	);
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
				<AppearanceTypographyCard
					fontFamily={fontFamily}
					fontSize={fontSize}
					availableFonts={availableFonts}
					fontSizeOptions={FONT_SIZE_OPTIONS}
					onFontFamilyChange={onFontFamilyChange}
					onFontSizeChange={onFontSizeChange}
				/>
			</div>
		</div>
	);
}
