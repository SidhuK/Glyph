import { useEffect, useRef, useState } from "react";
import { DEFAULT_ATTACHMENT_FOLDER } from "../../../lib/attachmentStorage";
import {
	type AttachmentStorageMode,
	type FocusMode,
	isFocusMode,
	loadSettings,
} from "../../../lib/settings";
import type { SettingsUpdatedPayload } from "../../../lib/settings/model";
import { useTauriEvent } from "../../../lib/tauriEvents";

interface NoteEditorSettings {
	showCollapsibleHeadings: boolean;
	showCollapsibleLists: boolean;
	showFrontmatterInEditor: boolean;
	showHeadingPrefixes: boolean;
	colorfulHeadings: boolean;
	peopleMentionsEnabled: boolean;
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
	showFormatBar: true,
	focusMode: "off",
	spellCheck: true,
};

function sameNoteEditorSettings(left: NoteEditorSettings, right: NoteEditorSettings) {
	return (
		left.showCollapsibleHeadings === right.showCollapsibleHeadings &&
		left.showCollapsibleLists === right.showCollapsibleLists &&
		left.showFrontmatterInEditor === right.showFrontmatterInEditor &&
		left.showHeadingPrefixes === right.showHeadingPrefixes &&
		left.colorfulHeadings === right.colorfulHeadings &&
		left.peopleMentionsEnabled === right.peopleMentionsEnabled &&
		left.showFormatBar === right.showFormatBar &&
		left.focusMode === right.focusMode &&
		left.spellCheck === right.spellCheck
	);
}

type LoadedEditorSettings = Awaited<ReturnType<typeof loadSettings>>["editor"];
type EditorSettingsChanges = NonNullable<SettingsUpdatedPayload["editor"]>;

function settingsFromLoaded(
	loaded: LoadedEditorSettings,
	current: NoteEditorSettings,
	keepShowFormatBar: boolean,
): NoteEditorSettings {
	const next = {
		showCollapsibleHeadings: loaded.showCollapsibleHeadings,
		showCollapsibleLists: loaded.showCollapsibleLists,
		showFrontmatterInEditor: loaded.showFrontmatterInEditor === true,
		showHeadingPrefixes: loaded.showHeadingPrefixes,
		colorfulHeadings: loaded.colorfulHeadings,
		peopleMentionsEnabled: loaded.enablePeopleMentionsAsTags,
		showFormatBar: keepShowFormatBar ? current.showFormatBar : loaded.showFormatBar,
		focusMode: isFocusMode(loaded.focusMode) ? loaded.focusMode : current.focusMode,
		spellCheck: typeof loaded.spellCheck === "boolean" ? loaded.spellCheck : current.spellCheck,
	};
	return sameNoteEditorSettings(current, next) ? current : next;
}

function settingsWithChanges(
	current: NoteEditorSettings,
	editor: EditorSettingsChanges,
): NoteEditorSettings {
	const next = {
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
		showFormatBar:
			typeof editor.showFormatBar === "boolean" ? editor.showFormatBar : current.showFormatBar,
		focusMode: isFocusMode(editor.focusMode) ? editor.focusMode : current.focusMode,
		spellCheck: typeof editor.spellCheck === "boolean" ? editor.spellCheck : current.spellCheck,
	};
	return sameNoteEditorSettings(current, next) ? current : next;
}

let lastKnownSettings = DEFAULT_NOTE_EDITOR_SETTINGS;

export function forgetLastKnownNoteEditorSettings(): void {
	lastKnownSettings = DEFAULT_NOTE_EDITOR_SETTINGS;
}

export function useNoteEditorSettings() {
	const [settings, setSettings] = useState(lastKnownSettings);
	const attachmentStorageModeRef = useRef<AttachmentStorageMode>("note-folder");
	const attachmentFolderRef = useRef<string | null>(DEFAULT_ATTACHMENT_FOLDER);
	const liveShowFormatBarRef = useRef(false);

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((loaded) => {
				if (cancelled) return;
				const keepShowFormatBar = liveShowFormatBarRef.current;
				lastKnownSettings = settingsFromLoaded(loaded.editor, lastKnownSettings, keepShowFormatBar);
				setSettings((current) => settingsFromLoaded(loaded.editor, current, keepShowFormatBar));
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
		lastKnownSettings = settingsWithChanges(lastKnownSettings, editor);
		setSettings((current) => settingsWithChanges(current, editor));
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
