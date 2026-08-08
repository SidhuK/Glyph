import { TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { splitYamlFrontmatter } from "../../../lib/notePreview";
import {
	SEARCH_JUMP_EVENT,
	type SearchJumpRequest,
	consumeSearchJump,
} from "../../../lib/searchJump";
import {
	findNoteSearchRanges,
	findPlainTextSearchRanges,
} from "../extensions/noteSearch";
import type { RawMarkdownEditorHandle } from "../raw/types";
import type { NoteInlineEditorMode } from "../types";

const MAX_SELECTION_QUERY_LENGTH = 120;

interface UseNoteFindOptions {
	editor: Editor | null;
	markdown: string;
	mode: NoteInlineEditorMode;
	relPath?: string;
	hostRef: RefObject<HTMLDivElement | null>;
	rawEditorRef: RefObject<RawMarkdownEditorHandle | null>;
	tiptapHostRef: RefObject<HTMLDivElement | null>;
}

// This function is used to check if the primary find shortcut is pressed
function isPrimaryFindShortcut(event: ReactKeyboardEvent | KeyboardEvent) {
	return (
		event.metaKey &&
		!event.ctrlKey &&
		!event.altKey &&
		!event.shiftKey &&
		event.key.toLowerCase() === "f"
	);
}

// This function is used to get the selected text for the query
function selectedTextForQuery(text: string): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized || normalized.length > MAX_SELECTION_QUERY_LENGTH) return "";
	return normalized;
}

/**
 * The editor is embedded in surfaces that scroll at different levels (the note
 * body, the external markdown window, the quick note panel), so the scroll host
 * is resolved from the DOM instead of assuming one container.
 */
function scrollHostFor(
	element: Element | null | undefined,
): HTMLElement | null {
	let current = element?.parentElement ?? null;
	while (current) {
		const overflowY = window.getComputedStyle(current).overflowY;
		if (overflowY === "auto" || overflowY === "scroll") return current;
		current = current.parentElement;
	}
	return null;
}

function centerElementInScrollHost(element: Element, scrollHost: HTMLElement) {
	const elementRect = element.getBoundingClientRect();
	const hostRect = scrollHost.getBoundingClientRect();
	const elementCenter = elementRect.top + elementRect.height / 2;
	const hostCenter = hostRect.top + hostRect.height / 2;
	scrollHost.scrollTo({
		top: scrollHost.scrollTop + elementCenter - hostCenter,
		behavior: "smooth",
	});
}

function centerEditorPosition(editor: Editor, pos: number) {
	const scrollHost = scrollHostFor(editor.view.dom);
	if (!scrollHost) return;

	try {
		const coords = editor.view.coordsAtPos(pos);
		const hostRect = scrollHost.getBoundingClientRect();
		const matchCenter = coords.top + (coords.bottom - coords.top) / 2;
		const hostCenter = hostRect.top + hostRect.height / 2;
		scrollHost.scrollTo({
			top: scrollHost.scrollTop + matchCenter - hostCenter,
			behavior: "smooth",
		});
	} catch {
		const activeMatch = scrollHost.querySelector(".noteSearchMatchActive");
		if (activeMatch) centerElementInScrollHost(activeMatch, scrollHost);
	}
}

export function useNoteFind({
	editor,
	markdown,
	mode,
	relPath,
	hostRef,
	rawEditorRef,
	tiptapHostRef,
}: UseNoteFindOptions) {
	const [findOpen, setFindOpen] = useState(false);
	const [findQuery, setFindQuery] = useState("");
	const [findActiveIndex, setFindActiveIndex] = useState(0);
	// A jump requested from search. Held separately from `findActiveIndex`
	// because the note's text and editor mode both load after the jump arrives,
	// and the target index can only be resolved once they have.
	const [searchJump, setSearchJump] = useState<SearchJumpRequest | null>(null);
	const findInputRef = useRef<HTMLInputElement | null>(null);
	const previousRelPathRef = useRef(relPath);

	/**
	 * `useEditor` deliberately does not re-render on transactions, and a note's
	 * content is applied after mount, so the document has to be subscribed to
	 * explicitly or matches would be computed against an empty doc and never
	 * recomputed. Selecting `null` while find is closed keeps typing off React's
	 * render path.
	 */
	const editorDoc = useEditorState({
		editor,
		selector: ({ editor: instance }) =>
			findOpen && mode !== "plain" && instance && !instance.isDestroyed
				? instance.state.doc
				: null,
		equalityFn: (a, b) => a === b,
	});

	const findMatches = useMemo(() => {
		if (!findOpen || !findQuery) return [];
		if (mode === "plain") {
			return findPlainTextSearchRanges(markdown, findQuery);
		}
		if (!editorDoc) return [];
		return findNoteSearchRanges(editorDoc, findQuery);
	}, [editorDoc, findOpen, findQuery, markdown, mode]);
	/**
	 * Search counts occurrences from the note body, but the two editor modes
	 * search different text: the rich editor's document is the body alone, while
	 * the raw editor holds the whole file. So raw mode has to add the
	 * frontmatter's own occurrences back onto the body ordinal.
	 */
	const jumpTargetIndex = useMemo(() => {
		if (!searchJump || searchJump.query !== findQuery) return null;
		if (mode !== "plain") return searchJump.matchIndex;
		const { frontmatter } = splitYamlFrontmatter(markdown);
		if (!frontmatter) return searchJump.matchIndex;
		return (
			searchJump.matchIndex +
			findPlainTextSearchRanges(frontmatter, searchJump.query).length
		);
	}, [findQuery, markdown, mode, searchJump]);

	const effectiveFindActiveIndex = useMemo(() => {
		if (!findMatches.length) return 0;
		if (jumpTargetIndex !== null) {
			// Out of range means the occurrence has no counterpart the editor can
			// select — a hit inside link syntax the renderer hides, say. Start at
			// the first match rather than asserting a confidently wrong one.
			return jumpTargetIndex < findMatches.length ? jumpTargetIndex : 0;
		}
		return Math.min(findActiveIndex, findMatches.length - 1);
	}, [findActiveIndex, findMatches.length, jumpTargetIndex]);
	const findCountLabel = !findQuery
		? ""
		: findMatches.length
			? `${effectiveFindActiveIndex + 1} / ${findMatches.length}`
			: "0 / 0";

	const selectRichFindMatch = useCallback(
		(index: number) => {
			if (!editor || editor.isDestroyed) return;
			const match = findMatches[index];
			if (!match) return;
			try {
				const selection = TextSelection.create(
					editor.state.doc,
					match.from,
					match.to,
				);
				editor.view.dispatch(editor.state.tr.setSelection(selection));
				centerEditorPosition(editor, match.from);
			} catch {
				const activeMatch = tiptapHostRef.current?.querySelector(
					".noteSearchMatchActive",
				);
				const scrollHost = scrollHostFor(tiptapHostRef.current);
				if (activeMatch && scrollHost) {
					centerElementInScrollHost(activeMatch, scrollHost);
				}
			}
		},
		[editor, findMatches, tiptapHostRef],
	);

	const selectPlainFindMatch = useCallback(
		(index: number) => {
			const rawEditor = rawEditorRef.current;
			const match = findMatches[index];
			if (!rawEditor || !match) return;
			rawEditor.selectRange(match.from, match.to);
		},
		[findMatches, rawEditorRef],
	);

	const selectFindMatch = useCallback(
		(index: number) => {
			if (mode === "plain") {
				selectPlainFindMatch(index);
				return;
			}
			selectRichFindMatch(index);
		},
		[mode, selectPlainFindMatch, selectRichFindMatch],
	);

	const moveFindMatch = useCallback(
		(direction: 1 | -1) => {
			if (!findMatches.length) return;
			const nextIndex =
				(effectiveFindActiveIndex + direction + findMatches.length) %
				findMatches.length;
			setSearchJump(null);
			setFindActiveIndex(nextIndex);
			selectFindMatch(nextIndex);
		},
		[effectiveFindActiveIndex, findMatches.length, selectFindMatch],
	);

	useEffect(() => {
		if (!findOpen || !findQuery || !findMatches.length) return;
		selectFindMatch(effectiveFindActiveIndex);
	}, [
		effectiveFindActiveIndex,
		findMatches.length,
		findOpen,
		findQuery,
		selectFindMatch,
	]);

	const getSelectedSearchText = useCallback(() => {
		if (mode === "plain") {
			return selectedTextForQuery(
				rawEditorRef.current?.getSelectedText() ?? "",
			);
		}
		if (!editor || editor.isDestroyed || editor.state.selection.empty)
			return "";
		const selected = editor.state.doc.textBetween(
			editor.state.selection.from,
			editor.state.selection.to,
			" ",
		);
		return selectedTextForQuery(selected);
	}, [editor, mode, rawEditorRef]);

	const openFind = useCallback(() => {
		const selected = getSelectedSearchText();
		if (selected) {
			setFindQuery(selected);
			setFindActiveIndex(0);
		}
		setFindOpen(true);
	}, [getSelectedSearchText]);

	const closeFind = useCallback(() => {
		setSearchJump(null);
		setFindOpen(false);
		if (mode === "plain") {
			requestAnimationFrame(() => rawEditorRef.current?.focus());
			return;
		}
		if (editor && !editor.isDestroyed) {
			requestAnimationFrame(() => {
				if (!editor.isDestroyed) editor.view.focus();
			});
		}
	}, [editor, mode, rawEditorRef]);

	const handleFindInputKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLInputElement>) => {
			if (isPrimaryFindShortcut(event)) {
				event.preventDefault();
				event.currentTarget.select();
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				closeFind();
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				moveFindMatch(event.shiftKey ? -1 : 1);
			}
		},
		[closeFind, moveFindMatch],
	);

	const handleEditorKeyDownCapture = useCallback(
		(event: ReactKeyboardEvent<HTMLDivElement>) => {
			if (!isPrimaryFindShortcut(event)) return;
			const target = event.target instanceof Element ? event.target : null;
			if (target?.closest(".noteFindBar")) return;
			event.preventDefault();
			openFind();
		},
		[openFind],
	);

	const updateFindQuery = useCallback((nextQuery: string) => {
		setSearchJump(null);
		setFindQuery(nextQuery);
		setFindActiveIndex(0);
	}, []);

	const applySearchJump = useCallback((jump: SearchJumpRequest) => {
		// The active index is derived from the jump by `jumpTargetIndex`; this is
		// only the fallback for when the jump stops applying.
		setSearchJump(jump);
		setFindQuery(jump.query);
		setFindActiveIndex(0);
		setFindOpen(true);
	}, []);

	const isSearchJumpTarget = useCallback(
		(jump: SearchJumpRequest) =>
			hostRef.current
				?.closest("[data-editor-pane-id]")
				?.getAttribute("data-editor-pane-id") === jump.targetPaneId,
		[hostRef],
	);

	useEffect(() => {
		// A jump is claimed before the path check, because opening a search result
		// in a new tab mounts this hook already pointed at the target note.
		const targetPaneId = hostRef.current
			?.closest("[data-editor-pane-id]")
			?.getAttribute("data-editor-pane-id");
		const jump =
			relPath && targetPaneId ? consumeSearchJump(relPath, targetPaneId) : null;
		const pathChanged = previousRelPathRef.current !== relPath;
		previousRelPathRef.current = relPath;
		if (jump && isSearchJumpTarget(jump)) {
			applySearchJump(jump);
			return;
		}
		if (!pathChanged) return;
		setSearchJump(null);
		setFindOpen(false);
		setFindQuery("");
		setFindActiveIndex(0);
	}, [applySearchJump, hostRef, isSearchJumpTarget, relPath]);

	// Jump while this note is already open (palette → same tab).
	useEffect(() => {
		if (!relPath) return;
		const onJump = (event: Event) => {
			const detail = (event as CustomEvent<SearchJumpRequest>).detail;
			if (!detail || detail.path !== relPath || !isSearchJumpTarget(detail))
				return;
			consumeSearchJump(relPath, detail.targetPaneId);
			applySearchJump(detail);
		};
		window.addEventListener(SEARCH_JUMP_EVENT, onJump);
		return () => window.removeEventListener(SEARCH_JUMP_EVENT, onJump);
	}, [applySearchJump, isSearchJumpTarget, relPath]);

	useEffect(() => {
		if (!findOpen) return;
		const frame = requestAnimationFrame(() => {
			findInputRef.current?.focus();
			findInputRef.current?.select();
		});
		return () => cancelAnimationFrame(frame);
	}, [findOpen]);

	useEffect(() => {
		if (!editor || editor.isDestroyed) return;
		if (mode === "plain" || !findOpen) {
			editor.commands.setNoteSearch({ query: "", activeIndex: 0 });
			return;
		}
		editor.commands.setNoteSearch({
			query: findQuery,
			activeIndex: effectiveFindActiveIndex,
		});
	}, [editor, effectiveFindActiveIndex, findOpen, findQuery, mode]);

	useEffect(() => {
		if (!findOpen || !findQuery || !findMatches.length) return;
		if (mode === "plain") return;
		const frame = requestAnimationFrame(() => {
			const scrollHost = scrollHostFor(tiptapHostRef.current);
			const activeMatch = tiptapHostRef.current?.querySelector(
				".noteSearchMatchActive",
			);
			if (activeMatch && scrollHost) {
				centerElementInScrollHost(activeMatch, scrollHost);
			}
		});
		return () => cancelAnimationFrame(frame);
	}, [findMatches.length, findOpen, findQuery, mode, tiptapHostRef]);

	useEffect(() => {
		if (!findMatches.length && findActiveIndex === 0) return;
		if (findActiveIndex <= effectiveFindActiveIndex) return;
		setFindActiveIndex(effectiveFindActiveIndex);
	}, [effectiveFindActiveIndex, findActiveIndex, findMatches.length]);

	return {
		closeFind,
		findCountLabel,
		findInputRef,
		findMatchCount: findMatches.length,
		findOpen,
		findQuery,
		handleEditorKeyDownCapture,
		handleFindInputKeyDown,
		moveFindMatch,
		updateFindQuery,
	};
}
