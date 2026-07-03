import { useEffect, useRef, useState } from "react";
import { DEFAULT_ATTACHMENT_FOLDER } from "../../../lib/attachmentStorage";
import {
	type AttachmentStorageMode,
	loadSettings,
} from "../../../lib/settings";
import { useTauriEvent } from "../../../lib/tauriEvents";

export function useNoteEditorSettings() {
	const [showCollapsibleHeadings, setShowCollapsibleHeadings] = useState(false);
	const [showFrontmatterInEditor, setShowFrontmatterInEditor] = useState(false);
	const [colorfulHeadings, setColorfulHeadings] = useState(false);
	const [peopleMentionsEnabled, setPeopleMentionsEnabled] = useState(false);
	const [vimKeybindingsEnabled, setVimKeybindingsEnabled] = useState(false);
	const attachmentStorageModeRef = useRef<AttachmentStorageMode>("note-folder");
	const attachmentFolderRef = useRef<string | null>(DEFAULT_ATTACHMENT_FOLDER);

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				setShowCollapsibleHeadings(settings.editor.showCollapsibleHeadings);
				setShowFrontmatterInEditor(
					settings.editor.showFrontmatterInEditor === true,
				);
				setColorfulHeadings(settings.editor.colorfulHeadings);
				setPeopleMentionsEnabled(settings.editor.enablePeopleMentionsAsTags);
				setVimKeybindingsEnabled(settings.editor.vimKeybindings === true);
				attachmentStorageModeRef.current =
					settings.editor.attachmentStorageMode;
				attachmentFolderRef.current = settings.editor.attachmentFolder;
			})
			.catch(() => {
				if (cancelled) return;
				setShowCollapsibleHeadings(false);
				setShowFrontmatterInEditor(false);
				setColorfulHeadings(false);
				setPeopleMentionsEnabled(false);
				setVimKeybindingsEnabled(false);
				attachmentStorageModeRef.current = "note-folder";
				attachmentFolderRef.current = DEFAULT_ATTACHMENT_FOLDER;
			});
		return () => {
			cancelled = true;
		};
	}, []);

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
		if (typeof payload.editor?.enablePeopleMentionsAsTags === "boolean") {
			setPeopleMentionsEnabled(payload.editor.enablePeopleMentionsAsTags);
		}
		if (typeof payload.editor?.vimKeybindings === "boolean") {
			setVimKeybindingsEnabled(payload.editor.vimKeybindings);
		}
		if (payload.editor?.attachmentStorageMode) {
			attachmentStorageModeRef.current = payload.editor.attachmentStorageMode;
		}
		if ("attachmentFolder" in (payload.editor ?? {})) {
			attachmentFolderRef.current = payload.editor?.attachmentFolder ?? null;
		}
	});

	return {
		attachmentFolderRef,
		attachmentStorageModeRef,
		colorfulHeadings,
		peopleMentionsEnabled,
		showCollapsibleHeadings,
		showFrontmatterInEditor,
		vimKeybindingsEnabled,
	};
}
