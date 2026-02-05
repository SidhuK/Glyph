import type { ThemeMode } from "../../../lib/settings";

interface GeneralSettingsAppearanceSectionProps {
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
}

export function GeneralSettingsAppearanceSection({
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
}: GeneralSettingsAppearanceSectionProps) {
	return (
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
					onChange={(e) => onThemeChange(e.target.value as ThemeMode)}
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
						onChange={(e) => onUiScaleChange(Number(e.target.value))}
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
					<div className="settingsHelp">Spacing for lists and controls.</div>
				</div>
				<div className="settingsSegmented">
					<button
						type="button"
						className={density === "comfortable" ? "active" : ""}
						onClick={() => onDensityChange("comfortable")}
					>
						Comfortable
					</button>
					<button
						type="button"
						className={density === "compact" ? "active" : ""}
						onClick={() => onDensityChange("compact")}
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
							onClick={() => onAccentChange(value)}
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
						onChange={(e) => onAiSidebarWidthChange(Number(e.target.value))}
					/>
					<span className="settingsRangeValue">{aiSidebarWidth}px</span>
				</div>
			</div>
		</section>
	);
}
