import { cn } from "@/lib/utils";
import type { ThemeMode } from "../../lib/settings";
import { AppearancePreviewFrame } from "./AppearancePreviewFrame";
import { THEME_MODE_OPTIONS } from "./themeModeOptions";

interface AppearanceThemeModePickerProps {
	themeMode: ThemeMode;
	onThemeModeChange: (mode: ThemeMode) => Promise<void>;
}

export function AppearanceThemeModePicker({
	themeMode,
	onThemeModeChange,
}: AppearanceThemeModePickerProps) {
	return (
		<div className="settingsSegmentedPicker">
			<div
				className="settingsSegmentedTrack"
				role="radiogroup"
				aria-label="Theme mode"
			>
				{THEME_MODE_OPTIONS.map((option) => (
					<label
						key={option.value}
						className={cn(
							"settingsSegmentedOption",
							themeMode === option.value && "is-active",
						)}
						data-theme-mode-preview={option.value}
						title={option.description}
					>
						<input
							type="radio"
							name="settings-theme-mode"
							checked={themeMode === option.value}
							onChange={() => void onThemeModeChange(option.value)}
							className="settingsSegmentedInput"
							aria-label={option.label}
						/>
						<AppearancePreviewFrame mode={option.value} />
						<span className="settingsSegmentedLabel">{option.label}</span>
					</label>
				))}
			</div>
		</div>
	);
}
