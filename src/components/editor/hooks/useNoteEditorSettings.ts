import { useEffect, useRef, useState } from "react";
import { DEFAULT_ATTACHMENT_FOLDER } from "../../../lib/attachmentStorage";
import {
	type AttachmentStorageMode,
	type FocusMode,
	isFocusMode,
	loadSettings,
} from "../../../lib/settings";
import { useTauriEvent } from "../../../lib/tauriEvents";

export function useNoteEditorSettings() {
	const [showCollapsibleHeadings, setShowCollapsibleHeadings] = useState(false);
	const [showCollapsibleLists, setShowCollapsibleLists] = useState(false);
	const [showFrontmatterInEditor, setShowFrontmatterInEditor] = useState(false);
	const [showHeadingPrefixes, setShowHeadingPrefixes] = useState(true);
	const [colorfulHeadings, setColorfulHeadings] = useState(false);
	const [peopleMentionsEnabled, setPeopleMentionsEnabled] = useState(false);
	const [showExternalLinkPreviews, setShowExternalLinkPreviews] =
		useState(false);
	const [focusMode, setFocusMode] = useState<FocusMode>("off");
	const attachmentStorageModeRef = useRef<AttachmentStorageMode>("note-folder");
	const attachmentFolderRef = useRef<string | null>(DEFAULT_ATTACHMENT_FOLDER);

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				setShowCollapsibleHeadings(settings.editor.showCollapsibleHeadings);
				setShowCollapsibleLists(settings.editor.showCollapsibleLists);
				setShowFrontmatterInEditor(
					settings.editor.showFrontmatterInEditor === true,
				);
				setShowHeadingPrefixes(settings.editor.showHeadingPrefixes);
				setColorfulHeadings(settings.editor.colorfulHeadings);
				setPeopleMentionsEnabled(settings.editor.enablePeopleMentionsAsTags);
				setShowExternalLinkPreviews(settings.editor.showExternalLinkPreviews);
				setFocusMode(settings.editor.focusMode);
				attachmentStorageModeRef.current =
					settings.editor.attachmentStorageMode;
				attachmentFolderRef.current = settings.editor.attachmentFolder;
			})
			.catch(() => {
				if (cancelled) return;
				setShowCollapsibleHeadings(false);
				setShowCollapsibleLists(false);
				setShowFrontmatterInEditor(false);
				setShowHeadingPrefixes(true);
				setColorfulHeadings(false);
				setPeopleMentionsEnabled(false);
				setShowExternalLinkPreviews(false);
				setFocusMode("off");
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
		if (typeof payload.editor?.showCollapsibleLists === "boolean") {
			setShowCollapsibleLists(payload.editor.showCollapsibleLists);
		}
		if (typeof payload.editor?.showFrontmatterInEditor === "boolean") {
			setShowFrontmatterInEditor(payload.editor.showFrontmatterInEditor);
		}
		if (typeof payload.editor?.showHeadingPrefixes === "boolean") {
			setShowHeadingPrefixes(payload.editor.showHeadingPrefixes);
		}
		if (typeof payload.editor?.colorfulHeadings === "boolean") {
			setColorfulHeadings(payload.editor.colorfulHeadings);
		}
		if (typeof payload.editor?.enablePeopleMentionsAsTags === "boolean") {
			setPeopleMentionsEnabled(payload.editor.enablePeopleMentionsAsTags);
		}
		if (typeof payload.editor?.showExternalLinkPreviews === "boolean") {
			setShowExternalLinkPreviews(payload.editor.showExternalLinkPreviews);
		}
		if (isFocusMode(payload.editor?.focusMode)) {
			setFocusMode(payload.editor.focusMode);
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
		focusMode,
		peopleMentionsEnabled,
		showCollapsibleHeadings,
		showCollapsibleLists,
		showFrontmatterInEditor,
		showHeadingPrefixes,
		showExternalLinkPreviews,
	};
}
