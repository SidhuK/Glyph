import { emit } from "@tauri-apps/api/event";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	type ThemeMode,
	loadSettings,
	setAiSidebarWidth,
	setTheme,
} from "../../lib/settings";
import { GeneralSettingsSections } from "./general/GeneralSettingsSections";

export function GeneralSettingsPane() {
	const { theme: activeTheme, setTheme: setNextTheme } = useTheme();
	const [error, setError] = useState("");
	const [aiSidebarWidth, setAiSidebarWidthState] = useState(420);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const s = await loadSettings();
				if (!cancelled) {
					setNextTheme(s.ui.theme);
				}
				if (!cancelled) {
					setAiSidebarWidthState(
						typeof s.ui.aiSidebarWidth === "number" ? s.ui.aiSidebarWidth : 420,
					);
				}
			} catch (e) {
				if (!cancelled) setError(extractErrorMessage(e));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [setNextTheme]);

	const themeValue: ThemeMode =
		activeTheme === "light" || activeTheme === "dark"
			? activeTheme
			: "system";

	return (
		<div className="settingsPane">
			<div className="settingsHero">
				<div>
					<h2>General</h2>
					<p className="settingsHint">
						Tune the appearance and layout of Lattice.
					</p>
				</div>
				<div className="settingsBadge">Local</div>
			</div>
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<GeneralSettingsSections
					theme={themeValue}
					onThemeChange={(next) => {
						setNextTheme(next);
						void setTheme(next);
						void emit("settings:theme_changed", { theme: next });
					}}
					aiSidebarWidth={aiSidebarWidth}
					onAiSidebarWidthChange={(next) => {
						setAiSidebarWidthState(next);
						void setAiSidebarWidth(next);
					}}
				/>
			</div>
		</div>
	);
}
