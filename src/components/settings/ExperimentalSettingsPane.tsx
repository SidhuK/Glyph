import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { type FocusMode, isFocusMode, loadSettings } from "../../lib/settings";
import { DURABLE_SETTINGS } from "../../lib/settings/definitions";
import { useTauriEvent } from "../../lib/tauriEvents";
import {
	SettingsInfoHint,
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";
import { useSettingsBoolean } from "./useSettingsBoolean";
import { useSettingsValue } from "./useSettingsValue";

const SETTINGS_QUERY_ROOT = "experimental-settings";

const FOCUS_MODE_VALUES = [
	"off",
	"paragraph",
	"sentence",
] as const satisfies readonly FocusMode[];

function VimModeInfo() {
	const { t } = useTranslation("settings.general");
	return (
		<SettingsInfoHint ariaLabel={t("editor.vimMode.helpAriaLabel")}>
			{t("editor.vimMode.info")}
		</SettingsInfoHint>
	);
}

export function ExperimentalSettingsPane() {
	const { t } = useTranslation("settings.general");
	const { t: tAppearance } = useTranslation("settings.appearance");
	const queryClient = useQueryClient();
	const [error, setError] = useState("");
	const settingsQuery = useQuery({
		queryKey: [SETTINGS_QUERY_ROOT],
		queryFn: () => loadSettings(),
	});
	const folioMode = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.folioMode.write,
		setError,
	);
	const noteSidePeek = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.noteSidePeek.write,
		setError,
	);
	const externalLinkPreviews = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.editorShowExternalLinkPreviews.write,
		setError,
	);
	const formatBar = useSettingsBoolean(
		true,
		DURABLE_SETTINGS.editorShowFormatBar.write,
		setError,
	);
	const rawMarkdownVimMode = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.editorRawMarkdownVimMode.write,
		setError,
	);
	const focusMode = useSettingsValue<FocusMode>(
		"off",
		DURABLE_SETTINGS.editorFocusMode.write,
		setError,
	);
	const nonMarkdownFiles = useSettingsBoolean(
		true,
		DURABLE_SETTINGS.showNonMarkdownFiles.write,
		setError,
	);

	const setInitialFolioMode = folioMode.setInitialChecked;
	const setInitialNoteSidePeek = noteSidePeek.setInitialChecked;
	const setInitialExternalLinkPreviews = externalLinkPreviews.setInitialChecked;
	const setInitialFormatBar = formatBar.setInitialChecked;
	const setInitialRawMarkdownVimMode = rawMarkdownVimMode.setInitialChecked;
	const setInitialFocusMode = focusMode.setInitialValue;
	const setInitialNonMarkdownFiles = nonMarkdownFiles.setInitialChecked;

	const settings = settingsQuery.data;
	useEffect(() => {
		if (!settings) return;
		setInitialFolioMode(settings.ui.folioMode);
		setInitialNoteSidePeek(settings.ui.noteSidePeek);
		setInitialExternalLinkPreviews(settings.editor.showExternalLinkPreviews);
		setInitialFormatBar(settings.editor.showFormatBar);
		setInitialRawMarkdownVimMode(settings.editor.rawMarkdownVimMode);
		setInitialFocusMode(settings.editor.focusMode);
		setInitialNonMarkdownFiles(settings.ui.showNonMarkdownFiles);
	}, [
		settings,
		setInitialExternalLinkPreviews,
		setInitialFolioMode,
		setInitialFormatBar,
		setInitialNoteSidePeek,
		setInitialFocusMode,
		setInitialNonMarkdownFiles,
		setInitialRawMarkdownVimMode,
	]);

	useTauriEvent("settings:updated", () => {
		void queryClient.invalidateQueries({ queryKey: [SETTINGS_QUERY_ROOT] });
	});

	const displayedError = settingsQuery.error
		? extractErrorMessage(settingsQuery.error)
		: error;

	return (
		<div className="settingsPane">
			{displayedError ? (
				<div className="settingsError">{displayedError}</div>
			) : null}
			<div className="settingsGrid">
				<SettingsSection
					title={t("experimental.sectionTitle")}
					description={t("experimental.sectionDescription")}
				>
					<SettingsRow
						label={tAppearance("layout.folioMode.label")}
						description={tAppearance("layout.folioMode.description")}
					>
						<SettingsToggle
							checked={folioMode.checked}
							disabled={folioMode.isSaving}
							ariaLabel={tAppearance("layout.folioMode.ariaLabel")}
							onCheckedChange={folioMode.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("experimental.noteSidePeek.label")}
						description={t("experimental.noteSidePeek.description")}
						searchId="appearance-layout-note-side-peek"
					>
						<SettingsToggle
							checked={noteSidePeek.checked}
							disabled={noteSidePeek.isSaving}
							ariaLabel={t("experimental.noteSidePeek.ariaLabel")}
							onCheckedChange={noteSidePeek.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						title={t("editor.vimMode.title")}
						label={
							<span className="settingsLabelWithHelp">
								{t("editor.vimMode.label")}
								<VimModeInfo />
							</span>
						}
						description={t("editor.vimMode.description")}
						interactive={false}
					>
						<SettingsToggle
							checked={rawMarkdownVimMode.checked}
							disabled={rawMarkdownVimMode.isSaving}
							ariaLabel={t("editor.vimMode.ariaLabel")}
							onCheckedChange={rawMarkdownVimMode.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.externalLinkPreviews.label")}
						description={t("editor.externalLinkPreviews.description")}
					>
						<SettingsToggle
							checked={externalLinkPreviews.checked}
							disabled={externalLinkPreviews.isSaving}
							ariaLabel={t("editor.externalLinkPreviews.ariaLabel")}
							onCheckedChange={externalLinkPreviews.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.formatBar.label")}
						description={t("editor.formatBar.description")}
						searchId="general-editor-format-bar"
					>
						<SettingsToggle
							checked={formatBar.checked}
							disabled={formatBar.isSaving}
							ariaLabel={t("editor.formatBar.ariaLabel")}
							onCheckedChange={formatBar.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.focusMode.label")}
						description={t("editor.focusMode.description")}
						interactive={false}
					>
						<SettingsSelect
							aria-label={t("editor.focusMode.ariaLabel")}
							value={focusMode.value}
							disabled={focusMode.isSaving}
							onChange={(event) => {
								const nextMode = event.currentTarget.value;
								if (!isFocusMode(nextMode)) return;
								focusMode.onChange(nextMode);
							}}
						>
							{FOCUS_MODE_VALUES.map((value) => (
								<option key={value} value={value}>
									{t(`editor.focusMode.options.${value}`)}
								</option>
							))}
						</SettingsSelect>
					</SettingsRow>
					<SettingsRow
						label={t("fileTree.nonMarkdownFiles.label")}
						description={t("fileTree.nonMarkdownFiles.description")}
					>
						<SettingsToggle
							checked={nonMarkdownFiles.checked}
							disabled={nonMarkdownFiles.isSaving}
							ariaLabel={t("fileTree.nonMarkdownFiles.ariaLabel")}
							onCheckedChange={nonMarkdownFiles.onCheckedChange}
						/>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
