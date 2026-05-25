import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { i18n } from "../../i18n";
import {
	type AppLanguage,
	LANGUAGE_OPTIONS,
	resolveSupportedLanguage,
} from "../../i18n/locales";
import { loadSettings, setLanguage } from "../../lib/settings";
import { LicenseSettingsCard } from "../licensing/LicenseSettingsCard";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";

export function GeneralSettingsPane() {
	const { t } = useTranslation(["settings", "common"]);
	const [language, setLanguageState] = useState<AppLanguage>("system");
	const [error, setError] = useState("");

	useEffect(() => {
		let cancelled = false;

		void loadSettings()
			.then((settings) => {
				if (!cancelled) setLanguageState(settings.ui.language);
			})
			.catch((cause) => {
				if (!cancelled) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			});

		return () => {
			cancelled = true;
		};
	}, []);

	const handleLanguageChange = async (nextLanguage: AppLanguage) => {
		setLanguageState(nextLanguage);
		setError("");
		try {
			await setLanguage(nextLanguage);
			const systemLanguages = Array.from(
				navigator.languages?.length
					? navigator.languages
					: [navigator.language],
			).filter(Boolean);
			await i18n.changeLanguage(
				resolveSupportedLanguage(nextLanguage, systemLanguages),
			);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	};

	return (
		<div className="settingsPane">
			<div className="settingsGrid">
				<SettingsSection title={t("settings:general.language.title")}>
					<SettingsRow
						label={t("settings:general.language.label")}
						description={
							language === "system"
								? t("settings:general.language.systemDescription")
								: t("settings:general.language.description")
						}
						htmlFor="settings-language-select"
					>
						<select
							id="settings-language-select"
							value={language}
							onChange={(event) =>
								void handleLanguageChange(event.target.value as AppLanguage)
							}
						>
							{LANGUAGE_OPTIONS.map((option) => (
								<option key={option.id} value={option.id}>
									{option.id === "system"
										? t("common:language.system")
										: option.nativeLabel}
								</option>
							))}
						</select>
						{error ? <p className="settingsHint">{error}</p> : null}
					</SettingsRow>
				</SettingsSection>
				<LicenseSettingsCard />
			</div>
		</div>
	);
}
