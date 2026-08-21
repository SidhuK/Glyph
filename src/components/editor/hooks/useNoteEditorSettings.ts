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
	const [showFormatBar, setShowFormatBar] = useState(true);
	const [focusMode, setFocusMode] = useState<FocusMode>("off");
	const attachmentStorageModeRef = useRef<AttachmentStorageMode>("note-folder");
	const attachmentFolderRef = useRef<string | null>(DEFAULT_ATTACHMENT_FOLDER);
	const liveEditorKeysRef = useRef(new Set<string>());

	useEffect(() => {
		let cancelled = false;
		const applyUnlessLive = (key: string, apply: () => void) => {
			if (!liveEditorKeysRef.current.has(key)) apply();
		};
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				applyUnlessLive("showCollapsibleHeadings", () => {
					setShowCollapsibleHeadings(settings.editor.showCollapsibleHeadings);
				});
				applyUnlessLive("showCollapsibleLists", () => {
					setShowCollapsibleLists(settings.editor.showCollapsibleLists);
				});
				applyUnlessLive("showFrontmatterInEditor", () => {
					setShowFrontmatterInEditor(
						settings.editor.showFrontmatterInEditor === true,
					);
				});
				applyUnlessLive("showHeadingPrefixes", () => {
					setShowHeadingPrefixes(settings.editor.showHeadingPrefixes);
				});
				applyUnlessLive("colorfulHeadings", () => {
					setColorfulHeadings(settings.editor.colorfulHeadings);
				});
				applyUnlessLive("enablePeopleMentionsAsTags", () => {
					setPeopleMentionsEnabled(settings.editor.enablePeopleMentionsAsTags);
				});
				applyUnlessLive("showExternalLinkPreviews", () => {
					setShowExternalLinkPreviews(settings.editor.showExternalLinkPreviews);
				});
				applyUnlessLive("showFormatBar", () => {
					setShowFormatBar(settings.editor.showFormatBar);
				});
				applyUnlessLive("focusMode", () => {
					setFocusMode(settings.editor.focusMode);
				});
				applyUnlessLive("attachmentStorageMode", () => {
					attachmentStorageModeRef.current =
						settings.editor.attachmentStorageMode;
				});
				applyUnlessLive("attachmentFolder", () => {
					attachmentFolderRef.current = settings.editor.attachmentFolder;
				});
			})
			.catch(() => {
				if (cancelled) return;
				applyUnlessLive("showCollapsibleHeadings", () => {
					setShowCollapsibleHeadings(false);
				});
				applyUnlessLive("showCollapsibleLists", () => {
					setShowCollapsibleLists(false);
				});
				applyUnlessLive("showFrontmatterInEditor", () => {
					setShowFrontmatterInEditor(false);
				});
				applyUnlessLive("showHeadingPrefixes", () => {
					setShowHeadingPrefixes(true);
				});
				applyUnlessLive("colorfulHeadings", () => {
					setColorfulHeadings(false);
				});
				applyUnlessLive("enablePeopleMentionsAsTags", () => {
					setPeopleMentionsEnabled(false);
				});
				applyUnlessLive("showExternalLinkPreviews", () => {
					setShowExternalLinkPreviews(false);
				});
				applyUnlessLive("showFormatBar", () => {
					setShowFormatBar(true);
				});
				applyUnlessLive("focusMode", () => {
					setFocusMode("off");
				});
				applyUnlessLive("attachmentStorageMode", () => {
					attachmentStorageModeRef.current = "note-folder";
				});
				applyUnlessLive("attachmentFolder", () => {
					attachmentFolderRef.current = DEFAULT_ATTACHMENT_FOLDER;
				});
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		const markLive = (key: string) => {
			liveEditorKeysRef.current.add(key);
		};
		if (typeof payload.editor?.showCollapsibleHeadings === "boolean") {
			markLive("showCollapsibleHeadings");
			setShowCollapsibleHeadings(payload.editor.showCollapsibleHeadings);
		}
		if (typeof payload.editor?.showCollapsibleLists === "boolean") {
			markLive("showCollapsibleLists");
			setShowCollapsibleLists(payload.editor.showCollapsibleLists);
		}
		if (typeof payload.editor?.showFrontmatterInEditor === "boolean") {
			markLive("showFrontmatterInEditor");
			setShowFrontmatterInEditor(payload.editor.showFrontmatterInEditor);
		}
		if (typeof payload.editor?.showHeadingPrefixes === "boolean") {
			markLive("showHeadingPrefixes");
			setShowHeadingPrefixes(payload.editor.showHeadingPrefixes);
		}
		if (typeof payload.editor?.colorfulHeadings === "boolean") {
			markLive("colorfulHeadings");
			setColorfulHeadings(payload.editor.colorfulHeadings);
		}
		if (typeof payload.editor?.enablePeopleMentionsAsTags === "boolean") {
			markLive("enablePeopleMentionsAsTags");
			setPeopleMentionsEnabled(payload.editor.enablePeopleMentionsAsTags);
		}
		if (typeof payload.editor?.showExternalLinkPreviews === "boolean") {
			markLive("showExternalLinkPreviews");
			setShowExternalLinkPreviews(payload.editor.showExternalLinkPreviews);
		}
		if (typeof payload.editor?.showFormatBar === "boolean") {
			markLive("showFormatBar");
			setShowFormatBar(payload.editor.showFormatBar);
		}
		if (isFocusMode(payload.editor?.focusMode)) {
			markLive("focusMode");
			setFocusMode(payload.editor.focusMode);
		}
		if (payload.editor?.attachmentStorageMode) {
			markLive("attachmentStorageMode");
			attachmentStorageModeRef.current = payload.editor.attachmentStorageMode;
		}
		if ("attachmentFolder" in (payload.editor ?? {})) {
			markLive("attachmentFolder");
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
		showFormatBar,
	};
}
