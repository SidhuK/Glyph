import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSpace } from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	type AiAssistantMode,
	type EditorWidthMode,
	loadSettings,
	setAiAssistantMode,
	setClassicAllNotesByDefault,
	setDatabaseShowColumnColor,
	setEditorBeautifulTags,
	setEditorColorfulHeadings,
	setEditorEnablePeopleMentionsAsTags,
	setEditorShowCollapsibleHeadings,
	setEditorShowFrontmatterInEditor,
	setEditorVimKeybindings,
	setEditorWidthMode,
	setFolioMode,
	setShowFileTreeFolderCounts,
	setShowToc,
} from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";

const VIM_KEYBINDING_HELP = [
	{ key: "Esc", action: "Enter Vim command mode." },
	{ key: "i", action: "Type at the cursor." },
	{ key: "a", action: "Type after the cursor." },
	{ key: "I", action: "Go to the start of the line and type." },
	{ key: "A", action: "Go to the end of the line and type." },
	{ key: "o", action: "Open a new line below and type." },
	{ key: "O", action: "Open a new line above and type." },
	{ key: "h / j / k / l", action: "Move left, down, up, and right." },
	{ key: "w", action: "Jump to the next word." },
	{ key: "b", action: "Jump back to the previous word." },
	{ key: "e", action: "Jump to the end of the word." },
	{ key: "0", action: "Jump to the start of the line." },
	{ key: "$", action: "Jump to the end of the line." },
	{ key: "gg", action: "Jump to the start of the note." },
	{ key: "G", action: "Jump to the end of the note." },
	{ key: "x", action: "Delete the character under or near the cursor." },
	{ key: "dd", action: "Delete the current line's contents." },
	{ key: "u", action: "Undo." },
	{ key: "Control-r", action: "Redo." },
] as const;

const EDITOR_WIDTH_VALUES = [
	"compact",
	"comfortable",
	"wide",
] as const satisfies readonly EditorWidthMode[];

function VimKeybindingsHelp() {
	const { t } = useTranslation("settings");
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="vimKeybindingsInfoButton"
					aria-label={t("advanced.editor.vimHelp.ariaLabel")}
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
					{t("advanced.editor.vimHelp.title")}
				</div>
				<div className="vimKeybindingsModes">
					<div>
						<strong>insert</strong> {t("advanced.editor.vimHelp.insertMode")}
					</div>
					<div>
						<strong>normal</strong> {t("advanced.editor.vimHelp.normalMode")}
					</div>
				</div>
				<div className="vimKeybindingsList">
					{VIM_KEYBINDING_HELP.map((item) => (
						<div className="vimKeybindingsItem" key={item.key}>
							<kbd>{item.key}</kbd>
							<span>{item.action}</span>
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function AdvancedSettingsPane() {
	const { t } = useTranslation("settings");
	const [showCollapsibleHeadings, setShowCollapsibleHeadings] = useState(false);
	const [showFrontmatterInEditor, setShowFrontmatterInEditor] = useState(false);
	const [colorfulHeadings, setColorfulHeadings] = useState(false);
	const [beautifulTags, setBeautifulTags] = useState(false);
	const [editorWidthMode, setEditorWidthModeState] =
		useState<EditorWidthMode>("compact");
	const [enablePeopleMentionsAsTags, setEnablePeopleMentionsAsTags] =
		useState(false);
	const [vimKeybindings, setVimKeybindings] = useState(false);
	const [showToc, setShowTocState] = useState(true);
	const [aiAssistantMode, setAiAssistantModeState] =
		useState<AiAssistantMode>("create");
	const [folioMode, setFolioModeState] = useState(false);
	const [classicAllNotesByDefault, setClassicAllNotesByDefaultState] =
		useState(false);
	const [showFileTreeFolderCounts, setShowFileTreeFolderCountsState] =
		useState(false);
	const [showDatabaseColumnColor, setShowDatabaseColumnColor] = useState(true);
	const [error, setError] = useState("");
	const [isSavingShowToc, setIsSavingShowToc] = useState(false);
	const [isSavingShowCollapsibleHeadings, setIsSavingShowCollapsibleHeadings] =
		useState(false);
	const [isSavingShowFrontmatterInEditor, setIsSavingShowFrontmatterInEditor] =
		useState(false);
	const [isSavingColorfulHeadings, setIsSavingColorfulHeadings] =
		useState(false);
	const [isSavingBeautifulTags, setIsSavingBeautifulTags] = useState(false);
	const [isSavingEditorWidthMode, setIsSavingEditorWidthMode] = useState(false);
	const [
		isSavingEnablePeopleMentionsAsTags,
		setIsSavingEnablePeopleMentionsAsTags,
	] = useState(false);
	const [isSavingVimKeybindings, setIsSavingVimKeybindings] = useState(false);
	const [isSavingAiAssistantMode, setIsSavingAiAssistantMode] = useState(false);
	const [isSavingFolioMode, setIsSavingFolioMode] = useState(false);
	const [
		isSavingClassicAllNotesByDefault,
		setIsSavingClassicAllNotesByDefault,
	] = useState(false);
	const [
		isSavingShowFileTreeFolderCounts,
		setIsSavingShowFileTreeFolderCounts,
	] = useState(false);
	const [isSavingDatabaseColumnColor, setIsSavingDatabaseColumnColor] =
		useState(false);
	const { spacePath, startIndexRebuild } = useSpace();

	const refresh = useCallback(async () => {
		setError("");
		try {
			const settings = await loadSettings();
			setShowCollapsibleHeadings(settings.editor.showCollapsibleHeadings);
			setShowFrontmatterInEditor(settings.editor.showFrontmatterInEditor);
			setColorfulHeadings(settings.editor.colorfulHeadings);
			setBeautifulTags(settings.editor.beautifulTags);
			setEditorWidthModeState(settings.editor.editorWidthMode);
			setEnablePeopleMentionsAsTags(settings.editor.enablePeopleMentionsAsTags);
			setVimKeybindings(settings.editor.vimKeybindings === true);
			setShowTocState(settings.ui.showToc);
			setAiAssistantModeState(settings.ui.aiAssistantMode);
			setFolioModeState(settings.ui.folioMode);
			setClassicAllNotesByDefaultState(settings.ui.classicAllNotesByDefault);
			setShowFileTreeFolderCountsState(settings.ui.showFileTreeFolderCounts);
			setShowDatabaseColumnColor(settings.database.showColumnColor);
		} catch (cause) {
			setError(extractErrorMessage(cause));
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.editor?.showCollapsibleHeadings === "boolean") {
			setShowCollapsibleHeadings(payload.editor.showCollapsibleHeadings);
		}
		if (typeof payload.editor?.showFrontmatterInEditor === "boolean") {
			setShowFrontmatterInEditor(payload.editor.showFrontmatterInEditor);
		}
		if (typeof payload.editor?.colorfulHeadings === "boolean") {
			setColorfulHeadings(payload.editor.colorfulHeadings);
		}
		if (typeof payload.editor?.beautifulTags === "boolean") {
			setBeautifulTags(payload.editor.beautifulTags);
		}
		if (
			payload.editor?.editorWidthMode === "compact" ||
			payload.editor?.editorWidthMode === "comfortable" ||
			payload.editor?.editorWidthMode === "wide"
		) {
			setEditorWidthModeState(payload.editor.editorWidthMode);
		}
		if (typeof payload.editor?.enablePeopleMentionsAsTags === "boolean") {
			setEnablePeopleMentionsAsTags(payload.editor.enablePeopleMentionsAsTags);
		}
		if (typeof payload.editor?.vimKeybindings === "boolean") {
			setVimKeybindings(payload.editor.vimKeybindings);
		}
		if (typeof payload.ui?.showToc === "boolean") {
			setShowTocState(payload.ui.showToc);
		}
		if (
			payload.ui?.aiAssistantMode === "chat" ||
			payload.ui?.aiAssistantMode === "create"
		) {
			setAiAssistantModeState(payload.ui.aiAssistantMode);
		}
		if (typeof payload.ui?.folioMode === "boolean") {
			setFolioModeState(payload.ui.folioMode);
		}
		if (typeof payload.ui?.classicAllNotesByDefault === "boolean") {
			setClassicAllNotesByDefaultState(payload.ui.classicAllNotesByDefault);
		}
		if (typeof payload.ui?.showFileTreeFolderCounts === "boolean") {
			setShowFileTreeFolderCountsState(payload.ui.showFileTreeFolderCounts);
		}
		if (typeof payload.database?.showColumnColor === "boolean") {
			setShowDatabaseColumnColor(payload.database.showColumnColor);
		}
	});

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<SettingsSection
					title={t("advanced.editor.title")}
					description={t("advanced.editor.description")}
				>
					<SettingsRow
						label={t("advanced.editor.tableOfContents")}
						description={t("advanced.editor.tableOfContentsDescription")}
					>
						<SettingsToggle
							checked={showToc}
							disabled={isSavingShowToc}
							ariaLabel={t("advanced.editor.tableOfContents")}
							onCheckedChange={(checked) => {
								const previous = showToc;
								setError("");
								setShowTocState(checked);
								setIsSavingShowToc(true);
								void setShowToc(checked)
									.catch((cause) => {
										setShowTocState(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingShowToc(false);
									});
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("advanced.editor.peopleMentionsAsTags")}
						description={t("advanced.editor.peopleMentionsAsTagsDescription")}
					>
						<SettingsToggle
							checked={enablePeopleMentionsAsTags}
							disabled={isSavingEnablePeopleMentionsAsTags}
							ariaLabel={t("advanced.editor.peopleMentionsAsTags")}
							onCheckedChange={(checked) => {
								const previous = enablePeopleMentionsAsTags;
								setError("");
								setIsSavingEnablePeopleMentionsAsTags(true);
								void (async () => {
									await invoke("index_set_people_mentions_as_tags_enabled", {
										enabled: checked,
									});
									if (spacePath) {
										await startIndexRebuild();
									}
									await setEditorEnablePeopleMentionsAsTags(checked);
									setEnablePeopleMentionsAsTags(checked);
								})()
									.catch((cause) => {
										setEnablePeopleMentionsAsTags(previous);
										void invoke("index_set_people_mentions_as_tags_enabled", {
											enabled: previous,
										}).catch(() => undefined);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingEnablePeopleMentionsAsTags(false);
									});
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("advanced.editor.showFrontmatter")}
						description={t("advanced.editor.showFrontmatterDescription")}
					>
						<SettingsToggle
							checked={showFrontmatterInEditor}
							disabled={isSavingShowFrontmatterInEditor}
							ariaLabel={t("advanced.editor.showFrontmatter")}
							onCheckedChange={(checked) => {
								const previous = showFrontmatterInEditor;
								setError("");
								setShowFrontmatterInEditor(checked);
								setIsSavingShowFrontmatterInEditor(true);
								void setEditorShowFrontmatterInEditor(checked)
									.catch((cause) => {
										setShowFrontmatterInEditor(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingShowFrontmatterInEditor(false);
									});
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("advanced.editor.colorfulHeadings")}
						description={t("advanced.editor.colorfulHeadingsDescription")}
					>
						<SettingsToggle
							checked={colorfulHeadings}
							disabled={isSavingColorfulHeadings}
							ariaLabel={t("advanced.editor.colorfulHeadings")}
							onCheckedChange={(checked) => {
								const previous = colorfulHeadings;
								setError("");
								setColorfulHeadings(checked);
								setIsSavingColorfulHeadings(true);
								void setEditorColorfulHeadings(checked)
									.catch((cause) => {
										setColorfulHeadings(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingColorfulHeadings(false);
									});
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("advanced.editor.beautifulTags")}
						description={t("advanced.editor.beautifulTagsDescription")}
					>
						<SettingsToggle
							checked={beautifulTags}
							disabled={isSavingBeautifulTags}
							ariaLabel={t("advanced.editor.beautifulTags")}
							onCheckedChange={(checked) => {
								const previous = beautifulTags;
								setError("");
								setBeautifulTags(checked);
								setIsSavingBeautifulTags(true);
								void setEditorBeautifulTags(checked)
									.catch((cause) => {
										setBeautifulTags(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingBeautifulTags(false);
									});
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("advanced.editor.editorWidth")}
						description={t("advanced.editor.editorWidthDescription")}
						interactive={false}
					>
						<SettingsSelect
							aria-label={t("advanced.editor.editorWidth")}
							value={editorWidthMode}
							disabled={isSavingEditorWidthMode}
							onChange={(event) => {
								const nextMode = event.currentTarget.value as EditorWidthMode;
								const previous = editorWidthMode;
								setError("");
								setEditorWidthModeState(nextMode);
								setIsSavingEditorWidthMode(true);
								void setEditorWidthMode(nextMode)
									.catch((cause) => {
										setEditorWidthModeState(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingEditorWidthMode(false);
									});
							}}
						>
							{EDITOR_WIDTH_VALUES.map((value) => (
								<option key={value} value={value}>
									{t(`advanced.editor.editorWidthModes.${value}`)}
								</option>
							))}
						</SettingsSelect>
					</SettingsRow>
					<SettingsRow
						label={t("advanced.editor.collapsibleHeadings")}
						description={t("advanced.editor.collapsibleHeadingsDescription")}
					>
						<SettingsToggle
							checked={showCollapsibleHeadings}
							disabled={isSavingShowCollapsibleHeadings}
							ariaLabel={t("advanced.editor.collapsibleHeadings")}
							onCheckedChange={(checked) => {
								const previous = showCollapsibleHeadings;
								setError("");
								setShowCollapsibleHeadings(checked);
								setIsSavingShowCollapsibleHeadings(true);
								void setEditorShowCollapsibleHeadings(checked)
									.catch((cause) => {
										setShowCollapsibleHeadings(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingShowCollapsibleHeadings(false);
									});
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label={
							<span className="settingsLabelWithHelp">
								{t("advanced.editor.vimMode")}
								<VimKeybindingsHelp />
							</span>
						}
						description={t("advanced.editor.vimModeDescription")}
					>
						<SettingsToggle
							checked={vimKeybindings}
							disabled={isSavingVimKeybindings}
							ariaLabel={t("advanced.editor.vimMode")}
							onCheckedChange={(checked) => {
								const previous = vimKeybindings;
								setError("");
								setVimKeybindings(checked);
								setIsSavingVimKeybindings(true);
								void setEditorVimKeybindings(checked)
									.catch((cause) => {
										setVimKeybindings(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingVimKeybindings(false);
									});
							}}
						/>
					</SettingsRow>
				</SettingsSection>
				<SettingsSection
					title={t("advanced.ai.title")}
					description={t("advanced.ai.description")}
				>
					<SettingsRow
						label={t("advanced.ai.toolsAccess")}
						description={t("advanced.ai.toolsAccessDescription")}
					>
						<SettingsToggle
							checked={aiAssistantMode === "create"}
							disabled={isSavingAiAssistantMode}
							ariaLabel={t("advanced.ai.toolsAccess")}
							onCheckedChange={(checked) => {
								const previous = aiAssistantMode;
								const nextMode: AiAssistantMode = checked ? "create" : "chat";
								setError("");
								setAiAssistantModeState(nextMode);
								setIsSavingAiAssistantMode(true);
								void setAiAssistantMode(nextMode)
									.catch((cause) => {
										setAiAssistantModeState(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingAiAssistantMode(false);
									});
							}}
						/>
					</SettingsRow>
				</SettingsSection>
				<SettingsSection
					title={t("advanced.app.title")}
					description={t("advanced.app.description")}
				>
					<SettingsRow
						label={t("advanced.app.folioMode")}
						description={t("advanced.app.folioModeDescription")}
					>
						<SettingsToggle
							checked={folioMode}
							disabled={isSavingFolioMode}
							ariaLabel={t("advanced.app.folioMode")}
							onCheckedChange={(checked) => {
								const previous = folioMode;
								setError("");
								setFolioModeState(checked);
								setIsSavingFolioMode(true);
								void setFolioMode(checked)
									.catch((cause) => {
										setFolioModeState(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingFolioMode(false);
									});
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("advanced.app.classicAllNotes")}
						description={t("advanced.app.classicAllNotesDescription")}
					>
						<SettingsToggle
							checked={classicAllNotesByDefault}
							disabled={isSavingClassicAllNotesByDefault}
							ariaLabel={t("advanced.app.classicAllNotes")}
							onCheckedChange={(checked) => {
								const previous = classicAllNotesByDefault;
								setError("");
								setClassicAllNotesByDefaultState(checked);
								setIsSavingClassicAllNotesByDefault(true);
								void setClassicAllNotesByDefault(checked)
									.catch((cause) => {
										setClassicAllNotesByDefaultState(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingClassicAllNotesByDefault(false);
									});
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("advanced.app.folderFileCounts")}
						description={t("advanced.app.folderFileCountsDescription")}
					>
						<SettingsToggle
							checked={showFileTreeFolderCounts}
							disabled={isSavingShowFileTreeFolderCounts}
							ariaLabel={t("advanced.app.folderFileCounts")}
							onCheckedChange={(checked) => {
								const previous = showFileTreeFolderCounts;
								setError("");
								setShowFileTreeFolderCountsState(checked);
								setIsSavingShowFileTreeFolderCounts(true);
								void setShowFileTreeFolderCounts(checked)
									.catch((cause) => {
										setShowFileTreeFolderCountsState(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingShowFileTreeFolderCounts(false);
									});
							}}
						/>
					</SettingsRow>
				</SettingsSection>
				<SettingsSection
					title={t("advanced.database.title")}
					description={t("advanced.database.description")}
				>
					<SettingsRow
						label={t("advanced.database.columnColor")}
						description={t("advanced.database.columnColorDescription")}
					>
						<SettingsToggle
							checked={showDatabaseColumnColor}
							disabled={isSavingDatabaseColumnColor}
							ariaLabel={t("advanced.database.columnColor")}
							onCheckedChange={(checked) => {
								const previous = showDatabaseColumnColor;
								setError("");
								setShowDatabaseColumnColor(checked);
								setIsSavingDatabaseColumnColor(true);
								void setDatabaseShowColumnColor(checked)
									.catch((cause) => {
										setShowDatabaseColumnColor(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingDatabaseColumnColor(false);
									});
							}}
						/>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
