import type { ThemeMode } from "../../../lib/settings";
import { GeneralSettingsAppearanceSection } from "./GeneralSettingsAppearanceSection";

interface GeneralSettingsSectionsProps {
	theme: ThemeMode;
	onThemeChange: (value: ThemeMode) => void;
	aiSidebarWidth: number;
	onAiSidebarWidthChange: (value: number) => void;
}

export function GeneralSettingsSections({
	theme,
	onThemeChange,
	aiSidebarWidth,
	onAiSidebarWidthChange,
}: GeneralSettingsSectionsProps) {
	return (
		<GeneralSettingsAppearanceSection
			theme={theme}
			onThemeChange={onThemeChange}
			aiSidebarWidth={aiSidebarWidth}
			onAiSidebarWidthChange={onAiSidebarWidthChange}
		/>
	);
}
