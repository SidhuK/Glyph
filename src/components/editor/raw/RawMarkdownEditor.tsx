import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
	forwardRef,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
} from "react";
import {
	createRawMarkdownExtensions,
	externalRawMarkdownUpdate,
} from "./extensions";
import type { RawMarkdownEditorHandle } from "./types";

interface RawMarkdownEditorProps {
	markdown: string;
	relPath?: string;
	onChange: (markdown: string) => void;
}

export const RawMarkdownEditor = forwardRef<
	RawMarkdownEditorHandle,
	RawMarkdownEditorProps
>(function RawMarkdownEditor({ markdown, relPath, onChange }, forwardedRef) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const onChangeRef = useRef(onChange);
	const initialMarkdownRef = useRef(markdown);
	const previousRelPathRef = useRef(relPath);
	const relPathRef = useRef(relPath);

	onChangeRef.current = onChange;
	relPathRef.current = relPath;

	useLayoutEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		const view = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: initialMarkdownRef.current,
				extensions: createRawMarkdownExtensions(
					(nextMarkdown) => {
						onChangeRef.current(nextMarkdown);
					},
					() => relPathRef.current ?? "",
				),
			}),
		});
		viewRef.current = view;

		return () => {
			viewRef.current = null;
			view.destroy();
		};
	}, []);

	useLayoutEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const currentMarkdown = view.state.doc.toString();
		const didChangeDocument = previousRelPathRef.current !== relPath;
		previousRelPathRef.current = relPath;

		if (currentMarkdown === markdown && !didChangeDocument) return;

		const currentSelection = view.state.selection.main;
		const nextLength = markdown.length;
		const selection = didChangeDocument
			? { anchor: 0 }
			: {
					anchor: Math.min(currentSelection.anchor, nextLength),
					head: Math.min(currentSelection.head, nextLength),
				};
		view.dispatch({
			changes:
				currentMarkdown === markdown
					? undefined
					: { from: 0, to: currentMarkdown.length, insert: markdown },
			selection,
			effects: didChangeDocument
				? EditorView.scrollIntoView(0, { y: "start" })
				: [],
			annotations: externalRawMarkdownUpdate.of(true),
		});
	}, [markdown, relPath]);

	useImperativeHandle(
		forwardedRef,
		() => ({
			focus: () => viewRef.current?.focus(),
			getSelectedText: () => {
				const view = viewRef.current;
				if (!view) return "";
				const { from, to } = view.state.selection.main;
				return view.state.doc.sliceString(from, to);
			},
			selectRange: (from, to) => {
				const view = viewRef.current;
				if (!view) return;
				const documentLength = view.state.doc.length;
				const safeFrom = Math.max(0, Math.min(from, documentLength));
				const safeTo = Math.max(safeFrom, Math.min(to, documentLength));
				view.dispatch({
					selection: { anchor: safeFrom, head: safeTo },
					effects: EditorView.scrollIntoView(safeFrom, { y: "center" }),
				});
				view.focus();
			},
		}),
		[],
	);

	return <div ref={hostRef} className="rfNodeNoteEditorRaw" />;
});
