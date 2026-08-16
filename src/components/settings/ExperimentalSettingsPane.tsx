import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { applyIfBoolean, useSettingsBoolean } from "./useSettingsBoolean";
import { useSettingsValue } from "./useSettingsValue";

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
	const [error, setError] = useState("");
	const folioMode = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.folioMode.write,
		setError,
	);
	const classicAllNotes = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.classicAllNotesByDefault.write,
		setError,
	);
	const externalLinkPreviews = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.editorShowExternalLinkPreviews.write,
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

	const setFolioModeChecked = folioMode.setChecked;
	const setClassicAllNotesChecked = classicAllNotes.setChecked;
	const setExternalLinkPreviewsChecked = externalLinkPreviews.setChecked;
	const setRawMarkdownVimModeChecked = rawMarkdownVimMode.setChecked;
	const setInitialFocusMode = focusMode.setInitialValue;
	const setFocusModeValue = focusMode.setValue;
	const setNonMarkdownFilesChecked = nonMarkdownFiles.setChecked;

	useEffect(() => {
		let cancelled = false;
		setError("");
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				setFolioModeChecked(settings.ui.folioMode);
				setClassicAllNotesChecked(settings.ui.classicAllNotesByDefault);
				setExternalLinkPreviewsChecked(
					settings.editor.showExternalLinkPreviews,
				);
				setRawMarkdownVimModeChecked(settings.editor.rawMarkdownVimMode);
				setInitialFocusMode(settings.editor.focusMode);
				setNonMarkdownFilesChecked(settings.ui.showNonMarkdownFiles);
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
		setClassicAllNotesChecked,
		setExternalLinkPreviewsChecked,
		setFolioModeChecked,
		setInitialFocusMode,
		setNonMarkdownFilesChecked,
		setRawMarkdownVimModeChecked,
	]);

	useTauriEvent(
		"settings:updated",
		useCallback(
			(payload) => {
				applyIfBoolean(payload.ui?.folioMode, setFolioModeChecked);
				applyIfBoolean(
					payload.ui?.classicAllNotesByDefault,
					setClassicAllNotesChecked,
				);
				applyIfBoolean(
					payload.editor?.showExternalLinkPreviews,
					setExternalLinkPreviewsChecked,
				);
				applyIfBoolean(
					payload.editor?.rawMarkdownVimMode,
					setRawMarkdownVimModeChecked,
				);
				if (isFocusMode(payload.editor?.focusMode)) {
					setFocusModeValue(payload.editor.focusMode);
				}
				applyIfBoolean(
					payload.ui?.showNonMarkdownFiles,
					setNonMarkdownFilesChecked,
				);
			},
			[
				setClassicAllNotesChecked,
				setExternalLinkPreviewsChecked,
				setFocusModeValue,
				setFolioModeChecked,
				setNonMarkdownFilesChecked,
				setRawMarkdownVimModeChecked,
			],
		),
	);

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}
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
						title={t("editor.vimMode.title")}
						label={
							<span className="settingsLabelWithHelp">
								{t("editor.vimMode.label")}
								<VimModeInfo />
							</span>
						}
						description={t("editor.vimMode.description")}
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
						label={tAppearance("layout.classicAllNotes.label")}
						description={tAppearance("layout.classicAllNotes.description")}
					>
						<SettingsToggle
							checked={classicAllNotes.checked}
							disabled={classicAllNotes.isSaving}
							ariaLabel={tAppearance("layout.classicAllNotes.ariaLabel")}
							onCheckedChange={classicAllNotes.onCheckedChange}
						/>
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
