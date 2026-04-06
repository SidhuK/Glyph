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
	setEditorEnablePeopleMentionsAsTags,
	setEditorShowCollapsibleHeadings,
	setShowFileTreeFolderCounts,
	setShowToc,
} from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";

export function AdvancedSettingsPane() {
	const [showCollapsibleHeadings, setShowCollapsibleHeadings] = useState(false);
	const [enablePeopleMentionsAsTags, setEnablePeopleMentionsAsTags] =
		useState(false);
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
	const [
		isSavingEnablePeopleMentionsAsTags,
		setIsSavingEnablePeopleMentionsAsTags,
	] = useState(false);
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
			setEnablePeopleMentionsAsTags(settings.editor.enablePeopleMentionsAsTags);
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
		if (typeof payload.editor?.enablePeopleMentionsAsTags === "boolean") {
			setEnablePeopleMentionsAsTags(payload.editor.enablePeopleMentionsAsTags);
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
