import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { Button } from "../ui/shadcn/button";
import { SettingsInfoHint, SettingsRow, SettingsSection } from "./SettingsScaffold";
import {
	useCopyThemeTemplate,
	useImportCustomTheme,
	useSaveThemeTemplate,
} from "./themes/useCustomThemeMutations";

/** Import and template actions. Installed custom themes appear as cards in the theme rows. */
export function AppearanceCustomThemesCard() {
	const { t } = useTranslation("settings.appearance");
	const importTheme = useImportCustomTheme();
	const copyTemplate = useCopyThemeTemplate();
	const saveTemplate = useSaveThemeTemplate();
	const error = importTheme.error ?? copyTemplate.error ?? saveTemplate.error;

	return (
		<SettingsSection
			title={t("customThemes.sectionTitle")}
			description={t("customThemes.sectionDescription")}
		>
			<SettingsRow
				title={t("customThemes.import.label")}
				label={
					<span className="settingsLabelWithHelp">
						{t("customThemes.import.label")}
						<SettingsInfoHint ariaLabel={t("customThemes.import.helpAriaLabel")}>
							{t("customThemes.import.description")}
						</SettingsInfoHint>
					</span>
				}
				interactive={false}
				searchId="appearance-custom-themes"
			>
				<Button
					type="button"
					variant="outline"
					disabled={importTheme.isPending}
					onClick={() => importTheme.mutate()}
				>
					{t("customThemes.import.action")}
				</Button>
			</SettingsRow>

			<SettingsRow
				label={t("customThemes.template.label")}
				description={t("customThemes.template.description")}
				interactive={false}
			>
				<div className="settingsActions">
					<Button type="button" variant="outline" onClick={() => copyTemplate.mutate()}>
						{t("customThemes.template.copy")}
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={saveTemplate.isPending}
						onClick={() => saveTemplate.mutate()}
					>
						{t("customThemes.template.save")}
					</Button>
				</div>
			</SettingsRow>

			{error ? (
				<div className="settingsError" role="alert">
					{extractErrorMessage(error)}
				</div>
			) : null}
		</SettingsSection>
	);
}
