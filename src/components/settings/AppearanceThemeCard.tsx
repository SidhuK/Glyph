import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { DURABLE_SETTINGS } from "../../lib/settings";
import { AppearanceThemeModePicker } from "./AppearanceThemeModePicker";
import { SettingsRow, SettingsSection, SettingsToggle } from "./SettingsScaffold";
import {
	pendingOr,
	useAppearanceSettingsQuery,
	useSettingWrite,
} from "./themes/useAppearanceThemeSettings";

/** Global appearance: color mode and the translucent sidebar. Theme choice lives below. */
export function AppearanceThemeCard() {
	const { t } = useTranslation("settings.appearance");
	const settings = useAppearanceSettingsQuery();
	const themeMode = useSettingWrite(DURABLE_SETTINGS.theme);
	const translucentApp = useSettingWrite(DURABLE_SETTINGS.translucentApp);
	const error = settings.error ?? themeMode.error ?? translucentApp.error;

	return (
		<SettingsSection title={t("theme.sectionTitle")}>
			<SettingsRow
				label={t("theme.appearance.label")}
				description={t("theme.appearance.description")}
				interactive={false}
				searchId="appearance-theme-mode"
			>
				<AppearanceThemeModePicker
					themeMode={
						pendingOr(themeMode, settings.data?.ui.theme) ?? DURABLE_SETTINGS.theme.defaultValue
					}
					onThemeModeChange={themeMode.mutate}
				/>
			</SettingsRow>
			<SettingsRow
				label={t("theme.translucentSidebar.label")}
				searchId="appearance-translucent-app"
			>
				<SettingsToggle
					ariaLabel={t("theme.translucentSidebar.ariaLabel")}
					checked={
						pendingOr(translucentApp, settings.data?.ui.translucentApp) ??
						DURABLE_SETTINGS.translucentApp.defaultValue
					}
					disabled={!settings.data}
					onCheckedChange={translucentApp.mutate}
				/>
			</SettingsRow>
			{error ? (
				<div className="settingsError" role="alert">
					{extractErrorMessage(error)}
				</div>
			) : null}
		</SettingsSection>
	);
}
