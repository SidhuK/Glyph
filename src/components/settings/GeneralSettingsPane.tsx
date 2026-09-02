import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
	type AppLanguage,
	LANGUAGE_OPTIONS,
	isAppLanguage,
} from "../../i18n/locales";
import { GLYPH_LINKS } from "../../lib/helpMenu";
import {
	DATE_DISPLAY_FORMAT_OPTIONS,
	DEFAULT_DATE_DISPLAY_FORMAT,
	type DateDisplayFormat,
	isDateDisplayFormat,
	loadSettings,
} from "../../lib/settings";
import { DURABLE_SETTINGS } from "../../lib/settings/definitions";
import { useTauriEvent } from "../../lib/tauriEvents";
import { LicenseSettingsCard } from "../licensing/LicenseSettingsCard";
import { FileTreeSettingsSection } from "./FileTreeSettingsSection";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";
import { applyIfBoolean, useSettingsBoolean } from "./useSettingsBoolean";
import { useSettingsValue } from "./useSettingsValue";

export function GeneralSettingsPane() {
	const { t } = useTranslation("settings.general");
	const [error, setError] = useState("");
	const [language, setLanguageState] = useState<AppLanguage>("en");
	const dateFormat = useSettingsValue<DateDisplayFormat>(
		DEFAULT_DATE_DISPLAY_FORMAT,
		DURABLE_SETTINGS.dateDisplayFormat.write,
		setError,
	);
	const resumeLastSession = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.resumeLastSession.write,
		setError,
	);
	const keepRunningOnLastWindowClose = useSettingsBoolean(
		DURABLE_SETTINGS.keepRunningOnLastWindowClose.defaultValue,
		DURABLE_SETTINGS.keepRunningOnLastWindowClose.write,
		setError,
	);
	const folderCounts = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.showFileTreeFolderCounts.write,
		setError,
	);

	const setResumeLastSessionChecked = resumeLastSession.setChecked;
	const setKeepRunningOnLastWindowCloseChecked =
		keepRunningOnLastWindowClose.setChecked;
	const setFolderCountsChecked = folderCounts.setChecked;
	const setInitialDateFormat = dateFormat.setInitialValue;
	const setDateFormatValue = dateFormat.setValue;

	useEffect(() => {
		let cancelled = false;
		setError("");
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				setLanguageState(settings.ui.language);
				setInitialDateFormat(settings.ui.dateDisplayFormat);
				setResumeLastSessionChecked(settings.ui.resumeLastSession);
				setKeepRunningOnLastWindowCloseChecked(
					settings.ui.keepRunningOnLastWindowClose,
				);
				setFolderCountsChecked(settings.ui.showFileTreeFolderCounts);
			})
			.catch((cause) => {
				if (!cancelled) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			});
		return () => {
			cancelled = true;
		};
	}, [
		setFolderCountsChecked,
		setInitialDateFormat,
		setKeepRunningOnLastWindowCloseChecked,
		setResumeLastSessionChecked,
	]);

	useTauriEvent(
		"settings:updated",
		useCallback(
			(payload) => {
				if (payload.ui?.language) {
					setLanguageState(payload.ui.language);
				}
				if (isDateDisplayFormat(payload.ui?.dateDisplayFormat)) {
					setDateFormatValue(payload.ui.dateDisplayFormat);
				}
				applyIfBoolean(
					payload.ui?.resumeLastSession,
					setResumeLastSessionChecked,
				);
				applyIfBoolean(
					payload.ui?.keepRunningOnLastWindowClose,
					setKeepRunningOnLastWindowCloseChecked,
				);
				applyIfBoolean(
					payload.ui?.showFileTreeFolderCounts,
					setFolderCountsChecked,
				);
			},
			[
				setDateFormatValue,
				setFolderCountsChecked,
				setKeepRunningOnLastWindowCloseChecked,
				setResumeLastSessionChecked,
			],
		),
	);

	const handleLanguageChange = async (nextLanguage: AppLanguage) => {
		const previous = language;
		setLanguageState(nextLanguage);
		try {
			await DURABLE_SETTINGS.language.write(nextLanguage);
		} catch (cause) {
			setLanguageState(previous);
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	};

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}
			<div className="settingsGrid">
				<SettingsSection
					title={t("startup.sectionTitle")}
					description={t("startup.sectionDescription")}
				>
					<SettingsRow
						label={t("startup.openPreviousTabs.label")}
						description={t("startup.openPreviousTabs.description")}
					>
						<SettingsToggle
							checked={resumeLastSession.checked}
							disabled={resumeLastSession.isSaving}
							ariaLabel={t("startup.openPreviousTabs.ariaLabel")}
							onCheckedChange={resumeLastSession.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("startup.keepRunningOnClose.label")}
						description={t("startup.keepRunningOnClose.description")}
					>
						<SettingsToggle
							checked={keepRunningOnLastWindowClose.checked}
							disabled={keepRunningOnLastWindowClose.isSaving}
							ariaLabel={t("startup.keepRunningOnClose.ariaLabel")}
							onCheckedChange={keepRunningOnLastWindowClose.onCheckedChange}
						/>
					</SettingsRow>
				</SettingsSection>
				<FileTreeSettingsSection
					folderCounts={folderCounts}
					setError={setError}
				/>
				<LicenseSettingsCard />
				<SettingsSection
					title={t("language.sectionTitle")}
					description={t("language.sectionDescription")}
				>
					<SettingsRow
						label={t("language.label")}
						description={
							<Trans
								ns="settings.general"
								i18nKey="language.communityNotice"
								components={{
									discord: (
										<button
											type="button"
											className="settingsInlineLink"
											onClick={() => {
												void openUrl(GLYPH_LINKS.discord);
											}}
										/>
									),
								}}
							/>
						}
						htmlFor="settings-language-select"
					>
						<SettingsSelect
							id="settings-language-select"
							aria-label={t("language.ariaLabel")}
							value={language}
							onChange={(event) => {
								if (!isAppLanguage(event.target.value)) return;
								void handleLanguageChange(event.target.value);
							}}
						>
							{LANGUAGE_OPTIONS.map((option) => (
								<option key={option.id} value={option.id}>
									{option.nativeLabel}
								</option>
							))}
						</SettingsSelect>
					</SettingsRow>
				</SettingsSection>
				<SettingsSection
					title={t("dateTime.sectionTitle")}
					description={t("dateTime.sectionDescription")}
				>
					<SettingsRow
						label={t("dateTime.dateFormat.label")}
						description={t("dateTime.dateFormat.description")}
						htmlFor="settings-date-format-select"
						interactive={false}
					>
						<SettingsSelect
							id="settings-date-format-select"
							aria-label={t("dateTime.dateFormat.ariaLabel")}
							value={dateFormat.value}
							disabled={dateFormat.isSaving}
							onChange={(event) => {
								const next = event.currentTarget.value;
								if (!isDateDisplayFormat(next)) return;
								dateFormat.onChange(next);
							}}
						>
							{DATE_DISPLAY_FORMAT_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</SettingsSelect>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
