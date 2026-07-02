import type { ThemeMode } from "../../lib/settings";
import { AppearancePreviewFrame } from "./AppearancePreviewFrame";
import { SettingsSegmentedPicker } from "./SettingsSegmentedPicker";
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
		<SettingsSegmentedPicker
			name="settings-theme-mode"
			ariaLabel="Theme mode"
			value={themeMode}
			options={THEME_MODE_OPTIONS}
			onChange={(next) => void onThemeModeChange(next)}
			renderPreview={(value) => <AppearancePreviewFrame mode={value} />}
			getDataAttributes={(value) => ({
				"data-theme-mode-preview": value,
			})}
		/>
	);
}
