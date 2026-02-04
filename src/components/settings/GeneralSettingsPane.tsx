import { useEffect, useState } from "react";
import {
	type ThemeMode,
	loadSettings,
	setAiSidebarWidth,
	setTheme,
} from "../../lib/settings";

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
				if (!cancelled)
					setAiSidebarWidthState(
						typeof s.ui.aiSidebarWidth === "number" ? s.ui.aiSidebarWidth : 420,
					);
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
				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Appearance</div>
							<div className="settingsCardHint">Theme, scale, and density.</div>
						</div>
						<div className="settingsPill">UI</div>
					</div>

					<div className="settingsField">
						<div>
							<label className="settingsLabel" htmlFor="themeMode">
								Theme
							</label>
							<div className="settingsHelp">Match the system or override.</div>
						</div>
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

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<label className="settingsLabel" htmlFor="uiScale">
									UI scale
								</label>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">
								{Math.round(uiScale * 100)}% scale for panels and controls.
							</div>
						</div>
						<div className="settingsRange">
							<input
								id="uiScale"
								type="range"
								min={0.8}
								max={1.2}
								step={0.05}
								value={uiScale}
								onChange={(e) => setUiScale(Number(e.target.value))}
							/>
							<span className="settingsRangeValue">
								{Math.round(uiScale * 100)}%
							</span>
						</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">Density</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">
								Spacing for lists and controls.
							</div>
						</div>
						<div className="settingsSegmented">
							<button
								type="button"
								className={density === "comfortable" ? "active" : ""}
								onClick={() => setDensity("comfortable")}
							>
								Comfortable
							</button>
							<button
								type="button"
								className={density === "compact" ? "active" : ""}
								onClick={() => setDensity("compact")}
							>
								Compact
							</button>
						</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">Accent</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">Subtle emphasis color.</div>
						</div>
						<div className="settingsSwatches">
							{["graphite", "blue", "green", "amber", "rose"].map((value) => (
								<button
									key={value}
									type="button"
									className={`settingsSwatch ${accent === value ? "active" : ""}`}
									data-swatch={value}
									onClick={() => setAccent(value)}
								>
									<span />
									{value}
								</button>
							))}
						</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">AI sidebar width</div>
							<div className="settingsHelp">Adjust the AI panel width.</div>
						</div>
						<div className="settingsRange">
							<input
								type="range"
								min={320}
								max={560}
								step={10}
								value={aiSidebarWidth}
								onChange={(e) => {
									const next = Number(e.target.value);
									setAiSidebarWidthState(next);
									void setAiSidebarWidth(next);
								}}
							/>
							<span className="settingsRangeValue">{aiSidebarWidth}px</span>
						</div>
					</div>
				</section>

				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Typography</div>
							<div className="settingsCardHint">Fonts and labels.</div>
						</div>
						<div className="settingsBadgeWarn">Under construction</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">UI font</div>
							<div className="settingsHelp">Labels, buttons, navigation.</div>
						</div>
						<select value={uiFont} onChange={(e) => setUiFont(e.target.value)}>
							<option value="inter">Inter</option>
							<option value="system">System</option>
							<option value="classic">Classic Serif</option>
							<option value="humanist">Humanist Sans</option>
						</select>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Editor font</div>
							<div className="settingsHelp">Note editor and code blocks.</div>
						</div>
						<select
							value={editorFont}
							onChange={(e) => setEditorFont(e.target.value)}
						>
							<option value="jetbrains">JetBrains Mono</option>
							<option value="ibmplex">IBM Plex Mono</option>
							<option value="sourcecode">Source Code</option>
							<option value="systemmono">System Mono</option>
						</select>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">Toolbar labels</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">Show text under icons.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={showToolbarLabels}
								onChange={() => setShowToolbarLabels((prev) => !prev)}
							/>
							<span />
						</label>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">Note metadata</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">Show created/updated stamps.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={showNoteMeta}
								onChange={() => setShowNoteMeta((prev) => !prev)}
							/>
							<span />
						</label>
					</div>
				</section>

				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Editor</div>
							<div className="settingsCardHint">Writing behaviors.</div>
						</div>
						<div className="settingsBadgeWarn">Under construction</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">Auto-save</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">Save after short pauses.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={autoSave}
								onChange={() => setAutoSave((prev) => !prev)}
							/>
							<span />
						</label>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">Smart quotes</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">Replace straight quotes.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={smartQuotes}
								onChange={() => setSmartQuotes((prev) => !prev)}
							/>
							<span />
						</label>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">Date format</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">How dates render in notes.</div>
						</div>
						<select
							value={dateFormat}
							onChange={(e) => setDateFormat(e.target.value)}
						>
							<option value="system">System locale</option>
							<option value="iso">YYYY-MM-DD</option>
							<option value="friendly">Jan 12, 2026</option>
						</select>
					</div>
				</section>

				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Accessibility</div>
							<div className="settingsCardHint">Comfort and focus.</div>
						</div>
						<div className="settingsBadgeWarn">Under construction</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">Reduce motion</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">Calmer transitions.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={reduceMotion}
								onChange={() => setReduceMotion((prev) => !prev)}
							/>
							<span />
						</label>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">High contrast</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">Sharper text and borders.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={highContrast}
								onChange={() => setHighContrast((prev) => !prev)}
							/>
							<span />
						</label>
					</div>
				</section>

				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Notifications</div>
							<div className="settingsCardHint">Banners and tone.</div>
						</div>
						<div className="settingsBadgeWarn">Under construction</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">Daily digest</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">Morning recap of activity.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={dailyDigest}
								onChange={() => setDailyDigest((prev) => !prev)}
							/>
							<span />
						</label>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">Tone</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">Notification sound profile.</div>
						</div>
						<select
							value={notificationTone}
							onChange={(e) => setNotificationTone(e.target.value)}
						>
							<option value="soft">Soft</option>
							<option value="neutral">Neutral</option>
							<option value="bright">Bright</option>
						</select>
					</div>
				</section>

				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Startup</div>
							<div className="settingsCardHint">What opens first.</div>
						</div>
						<div className="settingsBadgeWarn">Under construction</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">On launch</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">Pick your start view.</div>
						</div>
						<select
							value={startBehavior}
							onChange={(e) => setStartBehavior(e.target.value)}
						>
							<option value="last">Open last vault</option>
							<option value="picker">Vault picker</option>
							<option value="welcome">Welcome screen</option>
						</select>
					</div>
				</section>
			</div>
		</div>
	);
}
