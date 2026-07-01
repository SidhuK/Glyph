import type { Editor } from "@tiptap/core";
import { useEffect } from "react";
import {
	EDITOR_MENU_ACTION_EVENT,
	type EditorMenuActionDetail,
} from "../../../lib/appEvents";
import { createDetailsBlockContent } from "../extensions/detailsBlock";
import { isEditorTextColor } from "../textColors";
import { isEditorTextHighlight } from "../textHighlights";
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
	onTriggerExtractToNote?: () => void;
	onRegisterCalloutInserter?: (
		inserter: ((type: string) => void) | null,
	) => void;
}

/** @internal Shared reference used to route editor menu actions to the focused editor instance. */
let lastFocusedNoteEditorHost: HTMLDivElement | null = null;

function normalizeCalloutType(type: string): string {
	return type.toLowerCase() === "warn" ? "warning" : type.toLowerCase();
}

function createCalloutContent(type: string) {
	return {
		type: "blockquote",
		content: [
			{
				type: "paragraph",
				content: [{ type: "text", text: `[!${normalizeCalloutType(type)}]` }],
			},
			{ type: "paragraph" },
		],
	};
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
	onTriggerExtractToNote,
	onRegisterCalloutInserter,
}: UseRibbonCommandsOptions) {
	useEffect(() => {
		if (!editor || mode !== "rich") return;

		const runEditorAction = (action: string) => {
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
			const chain = editor
				.chain()
				.focus(null, { scrollIntoView: false })
				.extendMarkRange("link");
			const handled = (() => {
				switch (action) {
					case "bold":
						return chain.toggleBold().run();
					case "italic":
						return chain.toggleItalic().run();
					case "underline":
						return chain.toggleUnderline().run();
					case "strikethrough":
						return chain.toggleStrike().run();
					case "heading_1":
						return chain.toggleHeading({ level: 1 }).run();
					case "heading_2":
						return chain.toggleHeading({ level: 2 }).run();
					case "heading_3":
						return chain.toggleHeading({ level: 3 }).run();
					case "collapse_all_headings":
						return chain.collapseAllHeadings().run();
					case "expand_all_headings":
						return chain.expandAllHeadings().run();
					case "bullet_list":
						return chain.toggleBulletList().run();
					case "numbered_list":
						return chain.toggleOrderedList().run();
					case "todo_list":
						return chain.toggleTaskList().run();
					case "quote":
						return chain.toggleBlockquote().run();
					case "code_block":
						return chain.toggleCodeBlock().run();
					case "mermaid_chart":
						return chain
							.insertContent({
								type: "codeBlock",
								attrs: { language: "mermaid" },
								content: [
									{
										type: "text",
										text: "flowchart TD\n  A[Start] --> B[End]",
									},
								],
							})
							.run();
					case "table":
						return chain
							.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
							.run();
					case "divider":
						return chain.setHorizontalRule().run();
					case "details_block":
						return chain.insertContent(createDetailsBlockContent()).run();
					case "extract_selection_to_note":
						onTriggerExtractToNote?.();
						return true;
					case "callout_info":
						return chain.insertContent(createCalloutContent("info")).run();
					case "callout_warning":
						return chain.insertContent(createCalloutContent("warning")).run();
					case "callout_error":
						return chain.insertContent(createCalloutContent("error")).run();
					case "callout_success":
						return chain.insertContent(createCalloutContent("success")).run();
					case "callout_tip":
						return chain.insertContent(createCalloutContent("tip")).run();
					case "link_set": {
						const linkAttrs = editor.getAttributes("link") as {
							href?: string;
							target?: string;
						};
						onOpenLinkDialog(
							linkAttrs.href ?? "",
							linkAttrs.target === "_blank" ? "_blank" : "_self",
						);
						return true;
					}
					case "link_clear":
						return chain.unsetLink().run();
					case "color_clear":
						return chain.unsetTextColor().run();
					case "highlight_clear":
						return chain.unsetTextHighlight().run();
					default: {
						if (action.startsWith("color_")) {
							const color = action.slice("color_".length);
							if (isEditorTextColor(color)) {
								return chain.setTextColor(color).run();
							}
							return false;
						}
						if (action.startsWith("highlight_")) {
							const highlight = action.slice("highlight_".length);
							if (isEditorTextHighlight(highlight)) {
								return chain.setTextHighlight(highlight).run();
							}
							return false;
						}
						return false;
					}
				}
			})();
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
		onTriggerExtractToNote,
		tiptapHostRef,
	]);

	useEffect(() => {
		if (!onRegisterCalloutInserter) return;
		if (!editor || mode !== "rich") {
			onRegisterCalloutInserter(null);
			return;
		}
		onRegisterCalloutInserter((type: string) => {
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
				if (
					lastFocusedNoteEditorHost === currentHost &&
					!currentHost.contains(document.activeElement)
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
