import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { type AppLanguage, LANGUAGE_OPTIONS } from "../../i18n/locales";
import {
	type EditorViewMode,
	getDefaultEditorViewMode,
	isEditorViewMode,
} from "../../lib/editorMode";
import { GLYPH_LINKS } from "../../lib/helpMenu";
import {
	DATE_DISPLAY_FORMAT_OPTIONS,
	DEFAULT_DATE_DISPLAY_FORMAT,
	type DateDisplayFormat,
	type FocusMode,
	isDateDisplayFormat,
	isFocusMode,
	loadSettings,
	setDateDisplayFormat,
	setEditorColorfulHeadings,
	setEditorDefaultEditorMode,
	setEditorFocusMode,
	setEditorRawMarkdownVimMode,
	setEditorShowCollapsibleHeadings,
	setEditorShowFrontmatterInEditor,
	setEditorSpellCheck,
	setLanguage,
	setResumeLastSession,
	setShowFileTreeFolderCounts,
	setShowNonMarkdownFiles,
	setShowToc,
} from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import { LicenseSettingsCard } from "../licensing/LicenseSettingsCard";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { FileTreeSettingsSection } from "./FileTreeSettingsSection";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";
import { applyIfBoolean, useSettingsBoolean } from "./useSettingsBoolean";
import { useSettingsValue } from "./useSettingsValue";

const DEFAULT_EDITOR_MODE_VALUES = [
	"rich",
	"preview",
	"plain",
] as const satisfies readonly EditorViewMode[];

const FOCUS_MODE_VALUES = [
	"off",
	"paragraph",
	"sentence",
] as const satisfies readonly FocusMode[];

function VimModeInfo() {
	const { t } = useTranslation("settings.general");
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="vimModeInfoButton"
					aria-label={t("editor.vimMode.helpAriaLabel")}
				>
					<HugeiconsIcon
						icon={InformationCircleIcon}
						size="var(--icon-md)"
						strokeWidth={0.9}
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="right"
				sideOffset={8}
				className="vimModeInfoPopover"
			>
				{t("editor.vimMode.info")}
			</PopoverContent>
		</Popover>
	);
}

export function GeneralSettingsPane() {
	const { t } = useTranslation("settings.general");
	const [error, setError] = useState("");
	const [language, setLanguageState] = useState<AppLanguage>("en");
	const dateFormat = useSettingsValue<DateDisplayFormat>(
		DEFAULT_DATE_DISPLAY_FORMAT,
		setDateDisplayFormat,
		setError,
	);
	const defaultEditorMode = useSettingsValue<EditorViewMode>(
		getDefaultEditorViewMode,
		setEditorDefaultEditorMode,
		setError,
	);
	const focusMode = useSettingsValue<FocusMode>(
		"off",
		setEditorFocusMode,
		setError,
	);
	const resumeLastSession = useSettingsBoolean(
		false,
		setResumeLastSession,
		setError,
	);
	const showToc = useSettingsBoolean(true, setShowToc, setError);
	const showFrontmatter = useSettingsBoolean(
		false,
		setEditorShowFrontmatterInEditor,
		setError,
	);
	const colorfulHeadings = useSettingsBoolean(
		false,
		setEditorColorfulHeadings,
		setError,
	);
	const collapsibleHeadings = useSettingsBoolean(
		false,
		setEditorShowCollapsibleHeadings,
		setError,
	);
	const spellCheck = useSettingsBoolean(true, setEditorSpellCheck, setError);
	const rawMarkdownVimMode = useSettingsBoolean(
		false,
		setEditorRawMarkdownVimMode,
		setError,
	);
	const folderCounts = useSettingsBoolean(
		false,
		setShowFileTreeFolderCounts,
		setError,
	);
	const nonMarkdownFiles = useSettingsBoolean(
		true,
		setShowNonMarkdownFiles,
		setError,
	);

	const setResumeLastSessionChecked = resumeLastSession.setChecked;
	const setShowTocChecked = showToc.setChecked;
	const setShowFrontmatterChecked = showFrontmatter.setChecked;
	const setColorfulHeadingsChecked = colorfulHeadings.setChecked;
	const setCollapsibleHeadingsChecked = collapsibleHeadings.setChecked;
	const setSpellCheckChecked = spellCheck.setChecked;
	const setRawMarkdownVimModeChecked = rawMarkdownVimMode.setChecked;
	const setFolderCountsChecked = folderCounts.setChecked;
	const setNonMarkdownFilesChecked = nonMarkdownFiles.setChecked;
	const setInitialDefaultEditorMode = defaultEditorMode.setInitialValue;
	const setDefaultEditorModeValue = defaultEditorMode.setValue;
	const setInitialFocusMode = focusMode.setInitialValue;
	const setFocusModeValue = focusMode.setValue;
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
				setInitialDefaultEditorMode(settings.editor.defaultEditorMode);
				setInitialFocusMode(settings.editor.focusMode);
				setResumeLastSessionChecked(settings.ui.resumeLastSession);
				setShowTocChecked(settings.ui.showToc);
				setShowFrontmatterChecked(settings.editor.showFrontmatterInEditor);
				setColorfulHeadingsChecked(settings.editor.colorfulHeadings);
				setCollapsibleHeadingsChecked(settings.editor.showCollapsibleHeadings);
				setSpellCheckChecked(settings.editor.spellCheck);
				setRawMarkdownVimModeChecked(settings.editor.rawMarkdownVimMode);
				setFolderCountsChecked(settings.ui.showFileTreeFolderCounts);
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
		setResumeLastSessionChecked,
		setShowTocChecked,
		setShowFrontmatterChecked,
		setColorfulHeadingsChecked,
		setCollapsibleHeadingsChecked,
		setSpellCheckChecked,
		setRawMarkdownVimModeChecked,
		setFolderCountsChecked,
		setNonMarkdownFilesChecked,
		setInitialDateFormat,
		setInitialDefaultEditorMode,
		setInitialFocusMode,
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
				if (isEditorViewMode(payload.editor?.defaultEditorMode)) {
					setDefaultEditorModeValue(payload.editor.defaultEditorMode);
				}
				if (isFocusMode(payload.editor?.focusMode)) {
					setFocusModeValue(payload.editor.focusMode);
				}
				applyIfBoolean(
					payload.ui?.resumeLastSession,
					setResumeLastSessionChecked,
				);
				applyIfBoolean(payload.ui?.showToc, setShowTocChecked);
				applyIfBoolean(
					payload.editor?.showFrontmatterInEditor,
					setShowFrontmatterChecked,
				);
				applyIfBoolean(
					payload.editor?.colorfulHeadings,
					setColorfulHeadingsChecked,
				);
				applyIfBoolean(
					payload.editor?.showCollapsibleHeadings,
					setCollapsibleHeadingsChecked,
				);
				applyIfBoolean(payload.editor?.spellCheck, setSpellCheckChecked);
				applyIfBoolean(
					payload.editor?.rawMarkdownVimMode,
					setRawMarkdownVimModeChecked,
				);
				applyIfBoolean(
					payload.ui?.showFileTreeFolderCounts,
					setFolderCountsChecked,
				);
				applyIfBoolean(
					payload.ui?.showNonMarkdownFiles,
					setNonMarkdownFilesChecked,
				);
			},
			[
				setResumeLastSessionChecked,
				setShowTocChecked,
				setShowFrontmatterChecked,
				setColorfulHeadingsChecked,
				setCollapsibleHeadingsChecked,
				setSpellCheckChecked,
				setRawMarkdownVimModeChecked,
				setFolderCountsChecked,
				setNonMarkdownFilesChecked,
				setDateFormatValue,
				setDefaultEditorModeValue,
				setFocusModeValue,
			],
		),
	);

	const handleLanguageChange = async (nextLanguage: AppLanguage) => {
		const previous = language;
		setLanguageState(nextLanguage);
		try {
			await setLanguage(nextLanguage);
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
				</SettingsSection>
				<SettingsSection
					title={t("editor.sectionTitle")}
					description={t("editor.sectionDescription")}
				>
					<SettingsRow
						label={t("editor.tableOfContents.label")}
						description={t("editor.tableOfContents.description")}
					>
						<SettingsToggle
							checked={showToc.checked}
							disabled={showToc.isSaving}
							ariaLabel={t("editor.tableOfContents.ariaLabel")}
							onCheckedChange={showToc.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.showFrontmatter.label")}
						description={t("editor.showFrontmatter.description")}
					>
						<SettingsToggle
							checked={showFrontmatter.checked}
							disabled={showFrontmatter.isSaving}
							ariaLabel={t("editor.showFrontmatter.ariaLabel")}
							onCheckedChange={showFrontmatter.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.colorfulHeadings.label")}
						description={t("editor.colorfulHeadings.description")}
					>
						<SettingsToggle
							checked={colorfulHeadings.checked}
							disabled={colorfulHeadings.isSaving}
							ariaLabel={t("editor.colorfulHeadings.ariaLabel")}
							onCheckedChange={colorfulHeadings.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.collapsibleHeadings.label")}
						description={t("editor.collapsibleHeadings.description")}
					>
						<SettingsToggle
							checked={collapsibleHeadings.checked}
							disabled={collapsibleHeadings.isSaving}
							ariaLabel={t("editor.collapsibleHeadings.ariaLabel")}
							onCheckedChange={collapsibleHeadings.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.spellCheck.label")}
						description={t("editor.spellCheck.description")}
					>
						<SettingsToggle
							checked={spellCheck.checked}
							disabled={spellCheck.isSaving}
							ariaLabel={t("editor.spellCheck.ariaLabel")}
							onCheckedChange={spellCheck.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.defaultEditorMode.label")}
						description={t("editor.defaultEditorMode.description")}
						interactive={false}
					>
						<SettingsSelect
							aria-label={t("editor.defaultEditorMode.ariaLabel")}
							value={defaultEditorMode.value}
							disabled={defaultEditorMode.isSaving}
							onChange={(event) => {
								const nextMode = event.currentTarget.value;
								if (!isEditorViewMode(nextMode)) return;
								defaultEditorMode.onChange(nextMode);
							}}
						>
							{DEFAULT_EDITOR_MODE_VALUES.map((value) => (
								<option key={value} value={value}>
									{t(`editor.defaultEditorMode.options.${value}`)}
								</option>
							))}
						</SettingsSelect>
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
				</SettingsSection>
				<FileTreeSettingsSection
					folderCounts={folderCounts}
					nonMarkdownFiles={nonMarkdownFiles}
					setError={setError}
				/>
				<LicenseSettingsCard />
				<SettingsSection
					title={t("language.sectionTitle")}
					description={t("language.sectionDescription")}
				>
					<SettingsRow
						title={t("language.label")}
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
								void handleLanguageChange(event.target.value as AppLanguage);
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
						title={t("dateTime.dateFormat.label")}
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
