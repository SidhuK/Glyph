import { useEffect, useState } from "react";
import { type ThemeMode, loadSettings, setTheme } from "../../lib/settings";

export function GeneralSettingsPane() {
	const [theme, setThemeState] = useState<ThemeMode>("system");
	const [error, setError] = useState("");

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const s = await loadSettings();
				if (!cancelled) setThemeState(s.ui.theme);
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
			<h2>General</h2>
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsRow">
				<label className="settingsLabel" htmlFor="themeMode">
					Theme
				</label>
				<select
					id="themeMode"
					value={theme}
					onChange={(e) => {
						const next = e.target.value as ThemeMode;
						setThemeState(next);
						void setTheme(next);
					}}
				>
					<option value="system">System</option>
					<option value="light">Light</option>
					<option value="dark">Dark</option>
				</select>
			</div>
		</div>
	);
}
