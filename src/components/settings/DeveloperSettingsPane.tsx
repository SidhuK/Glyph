import { useTranslation } from "react-i18next";
import { SettingsSection } from "./SettingsScaffold";

export function DeveloperSettingsPane() {
	const { t } = useTranslation("settings.general");
	return (
		<div className="settingsPane">
			<div className="settingsGrid">
				<SettingsSection
					title={t("developer.sectionTitle")}
					description={t("developer.sectionDescription")}
				>
					<p className="settingsHint">{t("developer.empty")}</p>
				</SettingsSection>
			</div>
		</div>
	);
}
