import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { latex } from "codemirror-lang-latex";
import { useLayoutEffect, useRef } from "react";

interface LatexSourceEditorProps {
	autoFocus?: boolean;
	multiline: boolean;
	onApply: () => void;
	onCancel: () => void;
	onChange: (value: string) => void;
	value: string;
}

export function LatexSourceEditor({
	autoFocus = true,
	multiline,
	onApply,
	onCancel,
	onChange,
	value,
}: LatexSourceEditorProps) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const initialValueRef = useRef(value);
	const onApplyRef = useRef(onApply);
	const onCancelRef = useRef(onCancel);
	const onChangeRef = useRef(onChange);
	onApplyRef.current = onApply;
	onCancelRef.current = onCancel;
	onChangeRef.current = onChange;

	useLayoutEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		const view = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: initialValueRef.current,
				extensions: [
					history(),
					latex({
						autoCloseBrackets: true,
						autoCloseTags: true,
						enableAutocomplete: true,
						enableLinting: true,
						enableTooltips: true,
						fileName: "formula.tex",
						linter: {
							checkCitesWithoutBibliography: false,
							checkDuplicateLabels: false,
							checkMissingDocumentEnv: false,
							checkMissingReferences: false,
							checkUnclosedBraces: true,
							checkUnmatchedEnvironments: true,
						},
					}),
					EditorView.lineWrapping,
					EditorView.contentAttributes.of({
						"aria-label": "LaTeX equation source",
						spellcheck: "false",
					}),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) {
							onChangeRef.current(update.state.doc.toString());
						}
					}),
					keymap.of([
						{
							key: "Mod-Enter",
							run: () => {
								onApplyRef.current();
								return true;
							},
						},
						{
							key: "Escape",
							run: () => {
								onCancelRef.current();
								return true;
							},
						},
						...historyKeymap,
						...defaultKeymap,
					]),
				],
			}),
		});
		const focusFrame = autoFocus
			? window.requestAnimationFrame(() => view.focus())
			: null;
		return () => {
			if (focusFrame !== null) window.cancelAnimationFrame(focusFrame);
			view.destroy();
		};
	}, [autoFocus]);

	return (
		<div
			ref={hostRef}
			className="latexSourceEditor"
			data-multiline={multiline || undefined}
		/>
	);
}
