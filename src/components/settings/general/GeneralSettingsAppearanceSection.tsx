import type { ThemeMode } from "../../../lib/settings";

interface GeneralSettingsAppearanceSectionProps {
	theme: ThemeMode;
	onThemeChange: (value: ThemeMode) => void;
	aiSidebarWidth: number;
	onAiSidebarWidthChange: (value: number) => void;
}

export function GeneralSettingsAppearanceSection({
	theme,
	onThemeChange,
	aiSidebarWidth,
	onAiSidebarWidthChange,
}: GeneralSettingsAppearanceSectionProps) {
	return (
		<section className="settingsCard">
			<div className="settingsCardHeader">
				<div>
					<div className="settingsCardTitle">Appearance</div>
					<div className="settingsCardHint">Theme and layout.</div>
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
					onChange={(e) => onThemeChange(e.target.value as ThemeMode)}
				>
					<option value="system">System</option>
					<option value="light">Light</option>
					<option value="dark">Dark</option>
				</select>
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
						onChange={(e) => onAiSidebarWidthChange(Number(e.target.value))}
					/>
					<span className="settingsRangeValue">{aiSidebarWidth}px</span>
				</div>
			</div>
		</section>
	);
}
