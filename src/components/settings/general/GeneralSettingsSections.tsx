import type { ThemeMode } from "../../../lib/settings";
import { GeneralSettingsAppearanceSection } from "./GeneralSettingsAppearanceSection";

interface GeneralSettingsSectionsProps {
	theme: ThemeMode;
	onThemeChange: (value: ThemeMode) => void;
	uiScale: number;
	onUiScaleChange: (value: number) => void;
	density: "comfortable" | "compact";
	onDensityChange: (value: "comfortable" | "compact") => void;
	accent: string;
	onAccentChange: (value: string) => void;
	aiSidebarWidth: number;
	onAiSidebarWidthChange: (value: number) => void;
	uiFont: string;
	onUiFontChange: (value: string) => void;
	editorFont: string;
	onEditorFontChange: (value: string) => void;
	showToolbarLabels: boolean;
	onToggleToolbarLabels: () => void;
	showNoteMeta: boolean;
	onToggleNoteMeta: () => void;
	autoSave: boolean;
	onToggleAutoSave: () => void;
	smartQuotes: boolean;
	onToggleSmartQuotes: () => void;
	dateFormat: string;
	onDateFormatChange: (value: string) => void;
	reduceMotion: boolean;
	onToggleReduceMotion: () => void;
	highContrast: boolean;
	onToggleHighContrast: () => void;
	dailyDigest: boolean;
	onToggleDailyDigest: () => void;
	notificationTone: string;
	onNotificationToneChange: (value: string) => void;
	startBehavior: string;
	onStartBehaviorChange: (value: string) => void;
}

export function GeneralSettingsSections({
	theme,
	onThemeChange,
	uiScale,
	onUiScaleChange,
	density,
	onDensityChange,
	accent,
	onAccentChange,
	aiSidebarWidth,
	onAiSidebarWidthChange,
	uiFont,
	onUiFontChange,
	editorFont,
	onEditorFontChange,
	showToolbarLabels,
	onToggleToolbarLabels,
	showNoteMeta,
	onToggleNoteMeta,
	autoSave,
	onToggleAutoSave,
	smartQuotes,
	onToggleSmartQuotes,
	dateFormat,
	onDateFormatChange,
	reduceMotion,
	onToggleReduceMotion,
	highContrast,
	onToggleHighContrast,
	dailyDigest,
	onToggleDailyDigest,
	notificationTone,
	onNotificationToneChange,
	startBehavior,
	onStartBehaviorChange,
}: GeneralSettingsSectionsProps) {
	return (
		<>
			<GeneralSettingsAppearanceSection
				theme={theme}
				onThemeChange={onThemeChange}
				uiScale={uiScale}
				onUiScaleChange={onUiScaleChange}
				density={density}
				onDensityChange={onDensityChange}
				accent={accent}
				onAccentChange={onAccentChange}
				aiSidebarWidth={aiSidebarWidth}
				onAiSidebarWidthChange={onAiSidebarWidthChange}
			/>

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
					<select
						value={uiFont}
						onChange={(e) => onUiFontChange(e.target.value)}
					>
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
						onChange={(e) => onEditorFontChange(e.target.value)}
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
							onChange={onToggleToolbarLabels}
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
							onChange={onToggleNoteMeta}
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
							onChange={onToggleAutoSave}
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
							onChange={onToggleSmartQuotes}
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
						onChange={(e) => onDateFormatChange(e.target.value)}
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
							onChange={onToggleReduceMotion}
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
							onChange={onToggleHighContrast}
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
							onChange={onToggleDailyDigest}
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
						onChange={(e) => onNotificationToneChange(e.target.value)}
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
						onChange={(e) => onStartBehaviorChange(e.target.value)}
					>
						<option value="last">Open last vault</option>
						<option value="picker">Vault picker</option>
						<option value="welcome">Welcome screen</option>
					</select>
				</div>
			</section>
		</>
	);
}
