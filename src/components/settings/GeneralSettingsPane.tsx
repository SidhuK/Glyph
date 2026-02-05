import { useEffect, useState } from "react";
import {
	type ThemeMode,
	loadSettings,
	setAiSidebarWidth,
	setTheme,
} from "../../lib/settings";
import { GeneralSettingsSections } from "./general/GeneralSettingsSections";

export function GeneralSettingsPane() {
	const [theme, setThemeState] = useState<ThemeMode>("system");
	const [error, setError] = useState("");
	const [uiScale, setUiScale] = useState(1);
	const [density, setDensity] = useState<"comfortable" | "compact">(
		"comfortable",
	);
	const [accent, setAccent] = useState("graphite");
	const [aiSidebarWidth, setAiSidebarWidthState] = useState(420);
	const [uiFont, setUiFont] = useState("inter");
	const [editorFont, setEditorFont] = useState("jetbrains");
	const [showToolbarLabels, setShowToolbarLabels] = useState(true);
	const [showNoteMeta, setShowNoteMeta] = useState(true);
	const [autoSave, setAutoSave] = useState(true);
	const [smartQuotes, setSmartQuotes] = useState(false);
	const [reduceMotion, setReduceMotion] = useState(false);
	const [highContrast, setHighContrast] = useState(false);
	const [notificationTone, setNotificationTone] = useState("soft");
	const [dailyDigest, setDailyDigest] = useState(true);
	const [dateFormat, setDateFormat] = useState("system");
	const [startBehavior, setStartBehavior] = useState("last");

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const s = await loadSettings();
				if (!cancelled) setThemeState(s.ui.theme);
				if (!cancelled) {
					setAiSidebarWidthState(
						typeof s.ui.aiSidebarWidth === "number" ? s.ui.aiSidebarWidth : 420,
					);
				}
			} catch (e) {
				if (!cancelled) setError(e instanceof Error ? e.message : String(e));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<div className="settingsPane">
			<div className="settingsHero">
				<div>
					<h2>General</h2>
					<p className="settingsHint">
						Tune the interface, typography, and everyday behavior of Tether.
					</p>
				</div>
				<div className="settingsBadge">Local</div>
			</div>
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<GeneralSettingsSections
					theme={theme}
					onThemeChange={(next) => {
						setThemeState(next);
						void setTheme(next);
					}}
					uiScale={uiScale}
					onUiScaleChange={setUiScale}
					density={density}
					onDensityChange={setDensity}
					accent={accent}
					onAccentChange={setAccent}
					aiSidebarWidth={aiSidebarWidth}
					onAiSidebarWidthChange={(next) => {
						setAiSidebarWidthState(next);
						void setAiSidebarWidth(next);
					}}
					uiFont={uiFont}
					onUiFontChange={setUiFont}
					editorFont={editorFont}
					onEditorFontChange={setEditorFont}
					showToolbarLabels={showToolbarLabels}
					onToggleToolbarLabels={() => setShowToolbarLabels((prev) => !prev)}
					showNoteMeta={showNoteMeta}
					onToggleNoteMeta={() => setShowNoteMeta((prev) => !prev)}
					autoSave={autoSave}
					onToggleAutoSave={() => setAutoSave((prev) => !prev)}
					smartQuotes={smartQuotes}
					onToggleSmartQuotes={() => setSmartQuotes((prev) => !prev)}
					dateFormat={dateFormat}
					onDateFormatChange={setDateFormat}
					reduceMotion={reduceMotion}
					onToggleReduceMotion={() => setReduceMotion((prev) => !prev)}
					highContrast={highContrast}
					onToggleHighContrast={() => setHighContrast((prev) => !prev)}
					dailyDigest={dailyDigest}
					onToggleDailyDigest={() => setDailyDigest((prev) => !prev)}
					notificationTone={notificationTone}
					onNotificationToneChange={setNotificationTone}
					startBehavior={startBehavior}
					onStartBehaviorChange={setStartBehavior}
				/>
			</div>
		</div>
	);
}
