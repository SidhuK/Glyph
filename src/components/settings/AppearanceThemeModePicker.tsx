import { useTranslation } from "react-i18next";
import type { ThemeMode } from "../../lib/settings";
import { AppearancePreviewFrame } from "./AppearancePreviewFrame";
import { SettingsSegmentedPicker } from "./SettingsSegmentedPicker";
import { getThemeModeOptions } from "./themeModeOptions";

interface AppearanceThemeModePickerProps {
	themeMode: ThemeMode;
	onThemeModeChange: (mode: ThemeMode) => void;
}

export function AppearanceThemeModePicker({
	themeMode,
	onThemeModeChange,
}: AppearanceThemeModePickerProps) {
	const { t } = useTranslation("settings.appearance");
	return (
		<SettingsSegmentedPicker
			ariaLabel={t("theme.appearance.ariaLabel")}
			value={themeMode}
			options={getThemeModeOptions()}
			onChange={(next) => onThemeModeChange(next)}
			renderPreview={(value) => <AppearancePreviewFrame mode={value} />}
			getDataAttributes={(value) => ({
				"data-theme-mode-preview": value,
			})}
		/>
	);
}
