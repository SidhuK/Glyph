import type { Editor, JSONContent } from "@tiptap/core";
import { useEffect } from "react";
import {
	EDITOR_MENU_ACTION_EVENT,
	type EditorMenuActionDetail,
} from "../../../lib/appEvents";
import { invoke } from "../../../lib/tauri";
import { createCalloutContent, executeEditorAction } from "../editorActions";
import { isVisibleEditorHost } from "./editorDomUtils";

interface UseRibbonCommandsOptions {
	editor: Editor | null;
	canEdit: boolean;
	mode: string;
	tiptapHostRef: { readonly current: HTMLDivElement | null };
	/** State node (the same value passed through tiptapHostRef) needed for the focus-tracking effect. */
	tiptapHostNode: HTMLDivElement | null;
	/** Callback to open the link dialog with initial href/target from the editor selection */
	onOpenLinkDialog: (href: string, target: "_self" | "_blank") => void;
	onSendSelectionToAi?: () => void;
	onTriggerExtractToNote?: () => void;
	onRegisterCalloutInserter?: (
		inserter: ((type: string) => void) | null,
	) => void;
}

/** @internal Shared reference used to route editor menu actions to the focused editor instance. */
let lastFocusedNoteEditorHost: HTMLDivElement | null = null;

function createPlainTextPasteContent(text: string): JSONContent[] {
	const paragraphs: JSONContent[] = [];
	let lines: string[] = [];

	const appendParagraph = () => {
		const content: JSONContent[] = [];
		for (const [index, line] of lines.entries()) {
			if (line.length) content.push({ type: "text", text: line });
			if (index < lines.length - 1) content.push({ type: "hardBreak" });
		}
		paragraphs.push({
			type: "paragraph",
			...(content.length ? { content } : {}),
		});
		lines = [];
	};

	for (const line of text.split("\n")) {
		if (!line.length) {
			appendParagraph();
			continue;
		}
		lines.push(line);
	}
	if (lines.length) appendParagraph();

	return paragraphs;
}

/**
 * Sets up the global editor menu action listener (keyboard shortcuts, slash commands)
 * and the callout inserter registration for the note editor.
 *
 * Contains the full command dispatch switch that maps action names to TipTap chain commands.
 */
export function useRibbonCommands({
	editor,
	canEdit,
	mode,
	tiptapHostNode,
	tiptapHostRef,
	onOpenLinkDialog,
	onSendSelectionToAi,
	onTriggerExtractToNote,
	onRegisterCalloutInserter,
}: UseRibbonCommandsOptions) {
	useEffect(() => {
		if (!editor || editor.isDestroyed || mode !== "rich") return;

		const runEditorAction = (action: string) => {
			if (editor.isDestroyed) return;
			const host = tiptapHostRef.current;
			if (!host || !isVisibleEditorHost(host)) return;
			const activeElement = document.activeElement;
			if (activeElement instanceof HTMLElement) {
				if (host.contains(activeElement)) {
					lastFocusedNoteEditorHost = host;
				} else if (lastFocusedNoteEditorHost !== host) {
					return;
				}
			} else if (lastFocusedNoteEditorHost !== host) {
				return;
			}
			const scrollHost = host.closest(
				".rfNodeNoteEditorBody",
			) as HTMLElement | null;
			const scrollTop = scrollHost?.scrollTop ?? 0;
			const isReadOnlySafeAction =
				action === "collapse_all_headings" || action === "expand_all_headings";
			if (!canEdit && !isReadOnlySafeAction) return;

			if (action === "paste_without_formatting") {
				void invoke("read_clipboard_plain_text")
					.then((text) => {
						if (text == null || editor.isDestroyed || !editor.isEditable) {
							return;
						}
						const plain = text.replace(/\r\n?/g, "\n");
						if (!plain.length) return;
						const selection = {
							from: editor.state.selection.from,
							to: editor.state.selection.to,
						};
						if (plain.includes("\n") && !editor.isActive("codeBlock")) {
							if (
								!editor.commands.insertContentAt(
									selection,
									createPlainTextPasteContent(plain),
								)
							) {
								return;
							}
						} else {
							editor.view.dispatch(
								editor.state.tr.insertText(plain, selection.from, selection.to),
							);
						}
						editor.view.focus();
						if (scrollHost) {
							requestAnimationFrame(() => {
								scrollHost.scrollTop = scrollTop;
							});
						}
					})
					.catch((cause) => {
						console.warn("Paste without formatting failed", cause);
					});
				return;
			}

			const handled = executeEditorAction({
				action,
				editor,
				chain: editor
					.chain()
					.focus(null, { scrollIntoView: false })
					.extendMarkRange("link"),
				onOpenLinkDialog,
				onSendSelectionToAi,
				onTriggerExtractToNote,
			});
			if (!handled) return;
			if (scrollHost) {
				requestAnimationFrame(() => {
					scrollHost.scrollTop = scrollTop;
				});
			}
		};

		const onEditorMenuAction = (event: Event) => {
			const detail =
				event instanceof CustomEvent
					? (event.detail as EditorMenuActionDetail | null)
					: null;
			if (!detail?.action) return;
			runEditorAction(detail.action);
		};

		window.addEventListener(EDITOR_MENU_ACTION_EVENT, onEditorMenuAction);
		return () => {
			window.removeEventListener(EDITOR_MENU_ACTION_EVENT, onEditorMenuAction);
		};
	}, [
		canEdit,
		editor,
		mode,
		onOpenLinkDialog,
		onSendSelectionToAi,
		onTriggerExtractToNote,
		tiptapHostRef,
	]);

	useEffect(() => {
		if (!onRegisterCalloutInserter) return;
		if (!editor || editor.isDestroyed || mode !== "rich") {
			onRegisterCalloutInserter(null);
			return;
		}
		onRegisterCalloutInserter((type: string) => {
			if (editor.isDestroyed) return;
			const host = tiptapHostRef.current?.closest(
				".rfNodeNoteEditorBody",
			) as HTMLElement | null;
			const scrollTop = host?.scrollTop ?? 0;
			editor
				.chain()
				.focus(null, { scrollIntoView: false })
				.insertContent(createCalloutContent(type))
				.run();
			if (host) {
				requestAnimationFrame(() => {
					host.scrollTop = scrollTop;
				});
			}
		});
		return () => onRegisterCalloutInserter(null);
	}, [editor, mode, onRegisterCalloutInserter, tiptapHostRef]);

	// Track focus within this editor host to route global keyboard shortcuts correctly
	useEffect(() => {
		const host = tiptapHostNode;
		if (!host) return;
		const handleFocusIn = () => {
			lastFocusedNoteEditorHost = host;
		};
		const handleFocusOut = () => {
			const currentHost = host;
			window.setTimeout(() => {
				const activeElement = document.activeElement;
				// Palette editor actions run before focus is restored, so retain the
				// editor that opened the palette until its command has been dispatched.
				if (
					activeElement instanceof HTMLElement &&
					activeElement.closest(".commandPalette")
				) {
					return;
				}
				if (
					lastFocusedNoteEditorHost === currentHost &&
					!currentHost.contains(activeElement)
				) {
					lastFocusedNoteEditorHost = null;
				}
			}, 0);
		};
		handleFocusOut();
		host.addEventListener("focusin", handleFocusIn);
		host.addEventListener("focusout", handleFocusOut);
		return () => {
			host.removeEventListener("focusin", handleFocusIn);
			host.removeEventListener("focusout", handleFocusOut);
			if (lastFocusedNoteEditorHost === host) {
				lastFocusedNoteEditorHost = null;
			}
		};
	}, [tiptapHostNode]);
}
