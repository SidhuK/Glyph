import { BadgeInfoIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";
import { useSpace } from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	type AiAssistantMode,
	loadSettings,
	setAiAssistantMode,
	setDatabaseShowColumnColor,
	setDatabaseShowNoteCount,
	setDelightfulGlyph,
	setEditorColorfulHeadings,
	setEditorEnablePeopleMentionsAsTags,
	setEditorShowCollapsibleHeadings,
	setEditorVimKeybindings,
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

function VimKeybindingsHelp() {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="vimKeybindingsInfoButton"
					aria-label="Vim keybindings help"
				>
					<HugeiconsIcon icon={BadgeInfoIcon} size={14} strokeWidth={0.9} />
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="right"
				sideOffset={8}
				className="vimKeybindingsPopover"
			>
				<div className="vimKeybindingsPopoverTitle">Vim keybindings</div>
				<div className="vimKeybindingsModes">
					<div>
						<strong>insert</strong> means normal typing mode. You type and text
						appears, like the editor already does.
					</div>
					<div>
						<strong>normal</strong> means command mode. Your keys move around or
						edit text instead of typing letters.
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
	const [showCollapsibleHeadings, setShowCollapsibleHeadings] = useState(false);
	const [colorfulHeadings, setColorfulHeadings] = useState(false);
	const [enablePeopleMentionsAsTags, setEnablePeopleMentionsAsTags] =
		useState(false);
	const [vimKeybindings, setVimKeybindings] = useState(false);
	const [showToc, setShowTocState] = useState(true);
	const [aiAssistantMode, setAiAssistantModeState] =
		useState<AiAssistantMode>("create");
	const [delightfulGlyph, setDelightfulGlyphState] = useState(false);
	const [showFileTreeFolderCounts, setShowFileTreeFolderCountsState] =
		useState(false);
	const [showDatabaseColumnColor, setShowDatabaseColumnColor] = useState(true);
	const [showDatabaseNoteCount, setShowDatabaseNoteCount] = useState(false);
	const [error, setError] = useState("");
	const [isSavingShowToc, setIsSavingShowToc] = useState(false);
	const [isSavingShowCollapsibleHeadings, setIsSavingShowCollapsibleHeadings] =
		useState(false);
	const [isSavingColorfulHeadings, setIsSavingColorfulHeadings] =
		useState(false);
	const [
		isSavingEnablePeopleMentionsAsTags,
		setIsSavingEnablePeopleMentionsAsTags,
	] = useState(false);
	const [isSavingVimKeybindings, setIsSavingVimKeybindings] = useState(false);
	const [isSavingAiAssistantMode, setIsSavingAiAssistantMode] = useState(false);
	const [isSavingDelightfulGlyph, setIsSavingDelightfulGlyph] = useState(false);
	const [
		isSavingShowFileTreeFolderCounts,
		setIsSavingShowFileTreeFolderCounts,
	] = useState(false);
	const [isSavingDatabaseColumnColor, setIsSavingDatabaseColumnColor] =
		useState(false);
	const [isSavingDatabaseNoteCount, setIsSavingDatabaseNoteCount] =
		useState(false);
	const { spacePath, startIndexRebuild } = useSpace();

	const refresh = useCallback(async () => {
		setError("");
		try {
			const settings = await loadSettings();
			setShowCollapsibleHeadings(settings.editor.showCollapsibleHeadings);
			setColorfulHeadings(settings.editor.colorfulHeadings);
			setEnablePeopleMentionsAsTags(settings.editor.enablePeopleMentionsAsTags);
			setVimKeybindings(settings.editor.vimKeybindings === true);
			setShowTocState(settings.ui.showToc);
			setAiAssistantModeState(settings.ui.aiAssistantMode);
			setDelightfulGlyphState(settings.ui.delightfulGlyph);
			setShowFileTreeFolderCountsState(settings.ui.showFileTreeFolderCounts);
			setShowDatabaseColumnColor(settings.database.showColumnColor);
			setShowDatabaseNoteCount(settings.database.showNoteCount);
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
		if (typeof payload.editor?.colorfulHeadings === "boolean") {
			setColorfulHeadings(payload.editor.colorfulHeadings);
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
		if (typeof payload.ui?.delightfulGlyph === "boolean") {
			setDelightfulGlyphState(payload.ui.delightfulGlyph);
		}
		if (typeof payload.ui?.showFileTreeFolderCounts === "boolean") {
			setShowFileTreeFolderCountsState(payload.ui.showFileTreeFolderCounts);
		}
		if (typeof payload.database?.showColumnColor === "boolean") {
			setShowDatabaseColumnColor(payload.database.showColumnColor);
		}
		if (typeof payload.database?.showNoteCount === "boolean") {
			setShowDatabaseNoteCount(payload.database.showNoteCount);
		}
	});

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<SettingsSection
					title="Editor"
					description="Controls for editing behavior and note structure inside Glyph."
				>
					<SettingsRow
						label="Table of contents"
						description="Show a floating table of contents for each note."
					>
						<SettingsToggle
							checked={showToc}
							disabled={isSavingShowToc}
							ariaLabel="Table of contents"
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
						label="People mentions as tags"
						description="When enabled, standalone @mentions are indexed and shown as people in the sidebar and search."
					>
						<SettingsToggle
							checked={enablePeopleMentionsAsTags}
							disabled={isSavingEnablePeopleMentionsAsTags}
							ariaLabel="People mentions as tags"
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
						label="Colorful headings"
						description="Use distinct built-in colors for H1-H6 while editing notes."
					>
						<SettingsToggle
							checked={colorfulHeadings}
							disabled={isSavingColorfulHeadings}
							ariaLabel="Colorful headings"
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
						label="Collapsible headings"
						description="Show collapse toggles on note headings in editor and preview."
					>
						<SettingsToggle
							checked={showCollapsibleHeadings}
							disabled={isSavingShowCollapsibleHeadings}
							ariaLabel="Collapsible headings"
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
								Vim Mode
								<VimKeybindingsHelp />
							</span>
						}
						description="Do NOT Turn this ON if you don't know what it means."
					>
						<SettingsToggle
							checked={vimKeybindings}
							disabled={isSavingVimKeybindings}
							ariaLabel="Vim Mode"
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
					title="AI"
					description="Controls for how the AI assistant behaves by default."
				>
					<SettingsRow
						label="AI chat has access to tools"
						description="When on, AI can use tools to create and take actions. When off, it stays in chat-only mode."
					>
						<SettingsToggle
							checked={aiAssistantMode === "create"}
							disabled={isSavingAiAssistantMode}
							ariaLabel="AI chat has access to tools"
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
					title="App"
					description="Global app-level controls for the sidebar and workspace UI."
				>
					<SettingsRow
						label="delightful-glyph"
						description="Enable me for a surprise."
					>
						<SettingsToggle
							checked={delightfulGlyph}
							disabled={isSavingDelightfulGlyph}
							ariaLabel="delightful-glyph"
							onCheckedChange={(checked) => {
								const previous = delightfulGlyph;
								setError("");
								setDelightfulGlyphState(checked);
								setIsSavingDelightfulGlyph(true);
								void setDelightfulGlyph(checked)
									.catch((cause) => {
										setDelightfulGlyphState(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingDelightfulGlyph(false);
									});
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label="Show folder file counts"
						description="Show a recursive file total at the end of each folder row in the file tree."
					>
						<SettingsToggle
							checked={showFileTreeFolderCounts}
							disabled={isSavingShowFileTreeFolderCounts}
							ariaLabel="Show folder file counts"
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
					title="Database"
					description="Global controls for how databases are presented across Glyph."
				>
					<SettingsRow
						label="Show database column color"
						description="Keep the lane pill and tag colors while toggling the full column tint."
					>
						<SettingsToggle
							checked={showDatabaseColumnColor}
							disabled={isSavingDatabaseColumnColor}
							ariaLabel="Show database column color"
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
					<SettingsRow
						label="Show note count"
						description="Show the total number of notes in the database header."
					>
						<SettingsToggle
							checked={showDatabaseNoteCount}
							disabled={isSavingDatabaseNoteCount}
							ariaLabel="Show note count"
							onCheckedChange={(checked) => {
								const previous = showDatabaseNoteCount;
								setError("");
								setShowDatabaseNoteCount(checked);
								setIsSavingDatabaseNoteCount(true);
								void setDatabaseShowNoteCount(checked)
									.catch((cause) => {
										setShowDatabaseNoteCount(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingDatabaseNoteCount(false);
									});
							}}
						/>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
