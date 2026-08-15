import type { Editor } from "@tiptap/react";
import { type RefObject, useEffect } from "react";
import type { EditorViewMode } from "../../lib/editorMode";
import { normalizeRelPath } from "../../utils/path";
import type { TOCHeading } from "../editor/hooks/useTableOfContents";
import {
	findScrollParent,
	getHeadingElement,
} from "../editor/hooks/useTableOfContents";
import {
	INTERNAL_ANCHOR_CLICK_EVENT,
	type InternalAnchorClickDetail,
	WIKI_ANCHOR_NAVIGATE_EVENT,
	type WikiAnchorNavigateDetail,
	peekWikiAnchorNavigation,
	takeWikiAnchorNavigation,
} from "../editor/markdown/editorEvents";
import { resolveAnchorHeading } from "../editor/markdown/headingAnchor";
import { findBlockIdOffset } from "../editor/markdown/wikiLinkSlices";
import type { RawMarkdownEditorHandle } from "../editor/raw/types";
import { analyzeNoteInfo } from "./noteInfoAnalysis";

interface UseInternalAnchorNavigationArgs {
	editor: Editor | null;
	getPlainText: () => string;
	mode: EditorViewMode;
	rawEditorRef: RefObject<RawMarkdownEditorHandle | null>;
	relPath: string;
	selectVisibleHeading: (heading: TOCHeading) => void;
	tocHeadings: readonly TOCHeading[];
}

function scrollElementIntoView(el: HTMLElement): void {
	const scrollContainer = findScrollParent(el);
	if (scrollContainer) {
		const containerRect = scrollContainer.getBoundingClientRect();
		const elRect = el.getBoundingClientRect();
		const offset =
			elRect.top - containerRect.top + scrollContainer.scrollTop - 20;
		scrollContainer.scrollTo({ top: offset, behavior: "smooth" });
		return;
	}
	el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function findBlockPosInEditor(editor: Editor, blockId: string): number | null {
	const needle = `^${blockId}`;
	let found: number | null = null;
	editor.state.doc.descendants((node, pos) => {
		if (found !== null || !node.isTextblock) return;
		const text = node.textContent ?? "";
		const match = text.match(/(?:^|\s)(\^[A-Za-z0-9-]+)(?=\s*$)/);
		if (match?.[1] === needle) {
			found = pos;
			return false;
		}
	});
	return found;
}

function navigateWikiAnchor(options: {
	anchor: string;
	anchorKind: "heading" | "block";
	editor: Editor | null;
	getPlainText: () => string;
	mode: EditorViewMode;
	rawEditor: RawMarkdownEditorHandle | null;
	selectVisibleHeading: (heading: TOCHeading) => void;
	tocHeadings: readonly TOCHeading[];
}): boolean {
	const markdown = options.getPlainText();
	if (options.anchorKind === "heading") {
		const headings =
			options.mode === "plain"
				? analyzeNoteInfo(markdown, markdown, true).headings
				: options.tocHeadings;
		const heading = resolveAnchorHeading(headings, options.anchor);
		if (!heading) return false;
		options.selectVisibleHeading(heading);
		return true;
	}

	if (options.mode === "plain") {
		const offset = findBlockIdOffset(markdown, options.anchor);
		if (offset === null) return false;
		options.rawEditor?.selectRange(offset, offset);
		return true;
	}

	if (!options.editor) return false;
	const pos = findBlockPosInEditor(options.editor, options.anchor);
	if (pos === null) return false;
	try {
		const headingLike: TOCHeading = {
			id: `block-${options.anchor}`,
			level: 1,
			text: options.anchor,
			pos,
		};
		const el = getHeadingElement(options.editor, headingLike);
		if (el) scrollElementIntoView(el);
		options.editor.commands.setTextSelection(pos + 1);
		return true;
	} catch {
		return false;
	}
}

export function useInternalAnchorNavigation({
	editor,
	getPlainText,
	mode,
	rawEditorRef,
	relPath,
	selectVisibleHeading,
	tocHeadings,
}: UseInternalAnchorNavigationArgs) {
	useEffect(() => {
		const rawEditor = rawEditorRef.current;
		const apply = (anchorKind: "heading" | "block", anchor: string) =>
			navigateWikiAnchor({
				anchor,
				anchorKind,
				editor,
				getPlainText,
				mode,
				rawEditor,
				selectVisibleHeading,
				tocHeadings,
			});

		const tryPending = () => {
			const pending = peekWikiAnchorNavigation(normalizeRelPath(relPath));
			if (!pending) return;
			if (apply(pending.anchorKind, pending.anchor)) {
				takeWikiAnchorNavigation(normalizeRelPath(relPath));
			}
		};

		const onInternalAnchorClick = (event: Event) => {
			const detail = (event as CustomEvent<InternalAnchorClickDetail>).detail;
			if (!detail || detail.sourcePath !== relPath) return;
			apply("heading", detail.anchor);
		};

		const onWikiAnchorNavigate = (event: Event) => {
			const detail = (event as CustomEvent<WikiAnchorNavigateDetail>).detail;
			if (
				!detail ||
				normalizeRelPath(detail.path) !== normalizeRelPath(relPath)
			) {
				return;
			}
			if (apply(detail.anchorKind, detail.anchor)) {
				takeWikiAnchorNavigation(normalizeRelPath(relPath));
			}
		};

		window.addEventListener(INTERNAL_ANCHOR_CLICK_EVENT, onInternalAnchorClick);
		window.addEventListener(WIKI_ANCHOR_NAVIGATE_EVENT, onWikiAnchorNavigate);
		tryPending();
		return () => {
			window.removeEventListener(
				INTERNAL_ANCHOR_CLICK_EVENT,
				onInternalAnchorClick,
			);
			window.removeEventListener(
				WIKI_ANCHOR_NAVIGATE_EVENT,
				onWikiAnchorNavigate,
			);
		};
	}, [
		editor,
		getPlainText,
		mode,
		rawEditorRef,
		relPath,
		selectVisibleHeading,
		tocHeadings,
	]);
}
