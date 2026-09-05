import { useEffect, useRef, useState } from "react";
import { DEFAULT_ATTACHMENT_FOLDER } from "../../../lib/attachmentStorage";
import {
	type AttachmentStorageMode,
	type FocusMode,
	isFocusMode,
	loadSettings,
} from "../../../lib/settings";
import { useTauriEvent } from "../../../lib/tauriEvents";

interface NoteEditorSettings {
	showCollapsibleHeadings: boolean;
	showCollapsibleLists: boolean;
	showFrontmatterInEditor: boolean;
	showHeadingPrefixes: boolean;
	colorfulHeadings: boolean;
	peopleMentionsEnabled: boolean;
	showExternalLinkPreviews: boolean;
	showFormatBar: boolean;
	focusMode: FocusMode;
	spellCheck: boolean;
}

const DEFAULT_NOTE_EDITOR_SETTINGS: NoteEditorSettings = {
	showCollapsibleHeadings: false,
	showCollapsibleLists: false,
	showFrontmatterInEditor: false,
	showHeadingPrefixes: true,
	colorfulHeadings: false,
	peopleMentionsEnabled: false,
	showExternalLinkPreviews: false,
	showFormatBar: true,
	focusMode: "off",
	spellCheck: true,
};

export function useNoteEditorSettings() {
	const [settings, setSettings] = useState(DEFAULT_NOTE_EDITOR_SETTINGS);
	const attachmentStorageModeRef = useRef<AttachmentStorageMode>("note-folder");
	const attachmentFolderRef = useRef<string | null>(DEFAULT_ATTACHMENT_FOLDER);
	const liveShowFormatBarRef = useRef(false);

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((loaded) => {
				if (cancelled) return;
				setSettings((current) => ({
					showCollapsibleHeadings: loaded.editor.showCollapsibleHeadings,
					showCollapsibleLists: loaded.editor.showCollapsibleLists,
					showFrontmatterInEditor:
						loaded.editor.showFrontmatterInEditor === true,
					showHeadingPrefixes: loaded.editor.showHeadingPrefixes,
					colorfulHeadings: loaded.editor.colorfulHeadings,
					peopleMentionsEnabled: loaded.editor.enablePeopleMentionsAsTags,
					showExternalLinkPreviews: loaded.editor.showExternalLinkPreviews,
					showFormatBar: liveShowFormatBarRef.current
						? current.showFormatBar
						: loaded.editor.showFormatBar,
					focusMode: isFocusMode(loaded.editor.focusMode)
						? loaded.editor.focusMode
						: current.focusMode,
					spellCheck:
						typeof loaded.editor.spellCheck === "boolean"
							? loaded.editor.spellCheck
							: current.spellCheck,
				}));
				attachmentStorageModeRef.current = loaded.editor.attachmentStorageMode;
				attachmentFolderRef.current = loaded.editor.attachmentFolder;
			})
			.catch(() => {
				if (cancelled) return;
				setSettings((current) =>
					liveShowFormatBarRef.current
						? {
								...DEFAULT_NOTE_EDITOR_SETTINGS,
								showFormatBar: current.showFormatBar,
							}
						: DEFAULT_NOTE_EDITOR_SETTINGS,
				);
				attachmentStorageModeRef.current = "note-folder";
				attachmentFolderRef.current = DEFAULT_ATTACHMENT_FOLDER;
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		const editor = payload.editor;
		if (!editor) return;
		if (typeof editor.showFormatBar === "boolean") {
			liveShowFormatBarRef.current = true;
		}
		setSettings((current) => ({
			showCollapsibleHeadings:
				typeof editor.showCollapsibleHeadings === "boolean"
					? editor.showCollapsibleHeadings
					: current.showCollapsibleHeadings,
			showCollapsibleLists:
				typeof editor.showCollapsibleLists === "boolean"
					? editor.showCollapsibleLists
					: current.showCollapsibleLists,
			showFrontmatterInEditor:
				typeof editor.showFrontmatterInEditor === "boolean"
					? editor.showFrontmatterInEditor
					: current.showFrontmatterInEditor,
			showHeadingPrefixes:
				typeof editor.showHeadingPrefixes === "boolean"
					? editor.showHeadingPrefixes
					: current.showHeadingPrefixes,
			colorfulHeadings:
				typeof editor.colorfulHeadings === "boolean"
					? editor.colorfulHeadings
					: current.colorfulHeadings,
			peopleMentionsEnabled:
				typeof editor.enablePeopleMentionsAsTags === "boolean"
					? editor.enablePeopleMentionsAsTags
					: current.peopleMentionsEnabled,
			showExternalLinkPreviews:
				typeof editor.showExternalLinkPreviews === "boolean"
					? editor.showExternalLinkPreviews
					: current.showExternalLinkPreviews,
			showFormatBar:
				typeof editor.showFormatBar === "boolean"
					? editor.showFormatBar
					: current.showFormatBar,
			focusMode: isFocusMode(editor.focusMode)
				? editor.focusMode
				: current.focusMode,
			spellCheck:
				typeof editor.spellCheck === "boolean"
					? editor.spellCheck
					: current.spellCheck,
		}));
		if (editor.attachmentStorageMode) {
			attachmentStorageModeRef.current = editor.attachmentStorageMode;
		}
		if ("attachmentFolder" in editor) {
			attachmentFolderRef.current = editor.attachmentFolder ?? null;
		}
	});

	return {
		attachmentFolderRef,
		attachmentStorageModeRef,
		...settings,
	};
}
