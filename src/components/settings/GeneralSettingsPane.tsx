import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { type AppLanguage, LANGUAGE_OPTIONS } from "../../i18n/locales";
import { GLYPH_LINKS } from "../../lib/helpMenu";
import {
	loadSettings,
	setEditorColorfulHeadings,
	setEditorShowCollapsibleHeadings,
	setEditorShowFrontmatterInEditor,
	setEditorSpellCheck,
	setEditorVimKeybindings,
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

const VIM_HELP_ENTRIES = [
	{ key: "Esc", actionKey: "esc" },
	{ key: "i", actionKey: "i" },
	{ key: "a", actionKey: "a" },
	{ key: "I", actionKey: "I" },
	{ key: "A", actionKey: "A" },
	{ key: "o", actionKey: "o" },
	{ key: "O", actionKey: "O" },
	{ key: "h / j / k / l", actionKey: "hjkl" },
	{ key: "w", actionKey: "w" },
	{ key: "b", actionKey: "b" },
	{ key: "e", actionKey: "e" },
	{ key: "0", actionKey: "0" },
	{ key: "$", actionKey: "dollar" },
	{ key: "gg", actionKey: "gg" },
	{ key: "G", actionKey: "G" },
	{ key: "x", actionKey: "x" },
	{ key: "dd", actionKey: "dd" },
	{ key: "u", actionKey: "u" },
	{ key: "Control-r", actionKey: "controlR" },
] as const;

function VimKeybindingsHelp() {
	const { t } = useTranslation("settings.general");
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="vimKeybindingsInfoButton"
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
				className="vimKeybindingsPopover"
			>
				<div className="vimKeybindingsPopoverTitle">
					{t("editor.vimMode.helpTitle")}
				</div>
				<div className="vimKeybindingsModes">
					<div>
						<Trans
							ns="settings.general"
							i18nKey="editor.vimMode.insertMode"
							components={{ strong: <strong /> }}
						/>
					</div>
					<div>
						<Trans
							ns="settings.general"
							i18nKey="editor.vimMode.normalMode"
							components={{ strong: <strong /> }}
						/>
					</div>
				</div>
				<div className="vimKeybindingsList">
					{VIM_HELP_ENTRIES.map((item) => (
						<div className="vimKeybindingsItem" key={item.key}>
							<kbd>{item.key}</kbd>
							<span>{t(`editor.vimMode.help.${item.actionKey}`)}</span>
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function GeneralSettingsPane() {
	const { t } = useTranslation("settings.general");
	const [error, setError] = useState("");
	const [language, setLanguageState] = useState<AppLanguage>("en");
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
	const vimKeybindings = useSettingsBoolean(
		false,
		setEditorVimKeybindings,
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
	const setVimKeybindingsChecked = vimKeybindings.setChecked;
	const setFolderCountsChecked = folderCounts.setChecked;
	const setNonMarkdownFilesChecked = nonMarkdownFiles.setChecked;

	useEffect(() => {
		let cancelled = false;
		setError("");
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				setLanguageState(settings.ui.language);
				setResumeLastSessionChecked(settings.ui.resumeLastSession);
				setShowTocChecked(settings.ui.showToc);
				setShowFrontmatterChecked(settings.editor.showFrontmatterInEditor);
				setColorfulHeadingsChecked(settings.editor.colorfulHeadings);
				setCollapsibleHeadingsChecked(settings.editor.showCollapsibleHeadings);
				setSpellCheckChecked(settings.editor.spellCheck);
				setVimKeybindingsChecked(settings.editor.vimKeybindings);
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
		setVimKeybindingsChecked,
		setFolderCountsChecked,
		setNonMarkdownFilesChecked,
	]);

	useTauriEvent(
		"settings:updated",
		useCallback(
			(payload) => {
				if (payload.ui?.language) {
					setLanguageState(payload.ui.language);
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
					payload.editor?.vimKeybindings,
					setVimKeybindingsChecked,
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
				setVimKeybindingsChecked,
				setFolderCountsChecked,
				setNonMarkdownFilesChecked,
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
						title={t("editor.vimMode.title")}
						label={
							<span className="settingsLabelWithHelp">
								{t("editor.vimMode.label")}
								<VimKeybindingsHelp />
							</span>
						}
						description={t("editor.vimMode.description")}
					>
						<SettingsToggle
							checked={vimKeybindings.checked}
							disabled={vimKeybindings.isSaving}
							ariaLabel={t("editor.vimMode.ariaLabel")}
							onCheckedChange={vimKeybindings.onCheckedChange}
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
			</div>
		</div>
	);
}
