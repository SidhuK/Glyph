import { TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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
	const scrollHost = editor.view.dom.closest(
		".rfNodeNoteEditorBody",
	) as HTMLElement | null;
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
	rawEditorRef,
	tiptapHostRef,
}: UseNoteFindOptions) {
	const [findOpen, setFindOpen] = useState(false);
	const [findQuery, setFindQuery] = useState("");
	const [findActiveIndex, setFindActiveIndex] = useState(0);
	const findInputRef = useRef<HTMLInputElement | null>(null);
	const previousRelPathRef = useRef(relPath);

	const findMatches = useMemo(() => {
		if (!findOpen || !findQuery) return [];
		if (mode === "plain") {
			return findPlainTextSearchRanges(markdown, findQuery);
		}
		if (!editor) return [];
		return findNoteSearchRanges(editor.state.doc, findQuery);
	}, [editor, findOpen, findQuery, markdown, mode]);
	const effectiveFindActiveIndex = findMatches.length
		? Math.min(findActiveIndex, findMatches.length - 1)
		: 0;
	const findCountLabel = !findQuery
		? ""
		: findMatches.length
			? `${effectiveFindActiveIndex + 1} / ${findMatches.length}`
			: "0 / 0";

	const selectRichFindMatch = useCallback(
		(index: number) => {
			if (!editor) return;
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
				const scrollHost = tiptapHostRef.current?.closest(
					".rfNodeNoteEditorBody",
				) as HTMLElement | null;
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
		if (!editor || editor.state.selection.empty) return "";
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
		setFindOpen(false);
		if (mode === "plain") {
			requestAnimationFrame(() => rawEditorRef.current?.focus());
			return;
		}
		if (editor) {
			requestAnimationFrame(() => editor.view.focus());
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
		setFindQuery(nextQuery);
		setFindActiveIndex(0);
	}, []);

	useEffect(() => {
		if (previousRelPathRef.current === relPath) return;
		previousRelPathRef.current = relPath;
		setFindOpen(false);
		setFindQuery("");
		setFindActiveIndex(0);
	}, [relPath]);

	useEffect(() => {
		if (!findOpen) return;
		const frame = requestAnimationFrame(() => {
			findInputRef.current?.focus();
			findInputRef.current?.select();
		});
		return () => cancelAnimationFrame(frame);
	}, [findOpen]);

	useEffect(() => {
		if (!editor) return;
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
			const scrollHost = tiptapHostRef.current?.closest(
				".rfNodeNoteEditorBody",
			) as HTMLElement | null;
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
