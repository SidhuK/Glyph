import {
	autocompletion,
	closeBrackets,
	closeBracketsKeymap,
	completionKeymap,
} from "@codemirror/autocomplete";
import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
	HighlightStyle,
	bracketMatching,
	indentOnInput,
	syntaxHighlighting,
	syntaxTree,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { linter } from "@codemirror/lint";
import {
	highlightSelectionMatches,
	search,
	searchKeymap,
} from "@codemirror/search";
import {
	Annotation,
	EditorSelection,
	EditorState,
	type Extension,
} from "@codemirror/state";
import {
	type Command,
	EditorView,
	type ViewUpdate,
	drawSelection,
	dropCursor,
	highlightSpecialChars,
	keymap,
	rectangularSelection,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { vim } from "@replit/codemirror-vim";
import { latexHoverTooltip } from "codemirror-lang-latex";
import { createRawMarkdownDecorations } from "./decorations";
import {
	embeddedLatexCompletionSource,
	latexSnippetCompletionSource,
} from "./latexCompletions";
import { createRawLinkCompletionSource } from "./linkCompletions";
import {
	embeddedMathLinter,
	markdownMathExtension,
} from "./markdownMathLanguage";

const markdownHighlightStyle = HighlightStyle.define([
	{ tag: tags.heading1, class: "cm-raw-heading-token-1" },
	{ tag: tags.heading2, class: "cm-raw-heading-token-2" },
	{ tag: tags.heading3, class: "cm-raw-heading-token-3" },
	{ tag: tags.heading4, class: "cm-raw-heading-token-4" },
	{ tag: tags.heading5, class: "cm-raw-heading-token-5" },
	{ tag: tags.heading6, class: "cm-raw-heading-token-6" },
	{ tag: tags.strong, class: "cm-raw-strong" },
	{ tag: tags.emphasis, class: "cm-raw-emphasis" },
	{ tag: tags.strikethrough, class: "cm-raw-strikethrough" },
	{ tag: tags.link, class: "cm-raw-link" },
	{ tag: tags.url, class: "cm-raw-url" },
	{ tag: tags.monospace, class: "cm-raw-monospace" },
	{ tag: [tags.meta, tags.processingInstruction], class: "cm-raw-syntax" },
	{ tag: tags.contentSeparator, class: "cm-raw-horizontal-rule-token" },
	{ tag: tags.invalid, class: "cm-raw-invalid" },
	{ tag: tags.comment, class: "cm-raw-code-comment" },
	{ tag: tags.keyword, class: "cm-raw-code-keyword" },
	{ tag: [tags.string, tags.regexp], class: "cm-raw-code-string" },
	{ tag: [tags.number, tags.bool], class: "cm-raw-code-number" },
	{
		tag: [tags.typeName, tags.className, tags.function(tags.variableName)],
		class: "cm-raw-code-title",
	},
	{ tag: [tags.operator, tags.punctuation], class: "cm-raw-code-meta" },
	{ tag: tags.variableName, class: "cm-raw-code-variable" },
]);

export const externalRawMarkdownUpdate = Annotation.define<boolean>();

function wrapSelection(open: string, close = open): Command {
	return (view) => {
		const transaction = view.state.changeByRange((range) => {
			if (range.empty) {
				return {
					changes: { from: range.from, insert: `${open}${close}` },
					range: EditorSelection.cursor(range.from + open.length),
				};
			}

			return {
				changes: [
					{ from: range.from, insert: open },
					{ from: range.to, insert: close },
				],
				range: EditorSelection.range(
					range.from + open.length,
					range.to + open.length,
				),
			};
		});
		view.dispatch(transaction);
		return true;
	};
}

const toggleTaskAtCursor: Command = (view) => {
	const line = view.state.doc.lineAt(view.state.selection.main.head);
	const match = line.text.match(
		/^(\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+)\[([ xX])\](?=\s|$)/,
	);
	if (!match) return false;
	const markerPosition = line.from + (match[1]?.length ?? 0);
	const checked = match[2]?.toLowerCase() === "x";
	view.dispatch({
		changes: {
			from: markerPosition + 1,
			to: markerPosition + 2,
			insert: checked ? " " : "x",
		},
		effects: EditorView.announce.of(
			checked ? "Task marked incomplete" : "Task marked complete",
		),
	});
	return true;
};

function isInMarkdownTable(view: EditorView): boolean {
	let node = syntaxTree(view.state).resolveInner(
		view.state.selection.main.head,
		-1,
	);
	while (node) {
		if (node.name === "Table") return true;
		if (!node.parent) return false;
		node = node.parent;
	}
	return false;
}

function tableCellStarts(text: string, lineFrom: number): number[] {
	const starts: number[] = [];
	let cellStart = 0;
	if (text.startsWith("|")) cellStart = 1;
	if (cellStart < text.length && text[cellStart] === " ") cellStart += 1;
	starts.push(lineFrom + cellStart);

	for (let index = cellStart; index < text.length; index += 1) {
		if (text[index] !== "|" || text[index - 1] === "\\") continue;
		let nextStart = index + 1;
		if (nextStart < text.length && text[nextStart] === " ") nextStart += 1;
		if (nextStart < text.length) starts.push(lineFrom + nextStart);
	}
	return starts;
}

function moveTableCell(direction: 1 | -1): Command {
	return (view) => {
		if (!isInMarkdownTable(view)) return false;
		const cursor = view.state.selection.main.head;
		const line = view.state.doc.lineAt(cursor);
		const starts = tableCellStarts(line.text, line.from);
		const sameLineTarget =
			direction === 1
				? starts.find((position) => position > cursor)
				: [...starts].reverse().find((position) => position < cursor);
		if (sameLineTarget !== undefined) {
			view.dispatch({ selection: { anchor: sameLineTarget } });
			return true;
		}

		const nextLineNumber = line.number + direction;
		const hasNextLine =
			nextLineNumber >= 1 && nextLineNumber <= view.state.doc.lines;
		const nextLine = hasNextLine ? view.state.doc.line(nextLineNumber) : null;
		if (!nextLine?.text.includes("|")) {
			if (direction === -1) return false;
			const emptyCells = Array.from({ length: starts.length }, () => "");
			const newRow = `\n| ${emptyCells.join(" | ")} |`;
			const target = line.to + 3;
			view.dispatch({
				changes: { from: line.to, insert: newRow },
				selection: { anchor: target },
			});
			return true;
		}
		const nextStarts = tableCellStarts(nextLine.text, nextLine.from);
		const target =
			direction === 1 ? nextStarts[0] : nextStarts[nextStarts.length - 1];
		if (target === undefined) return false;
		view.dispatch({
			selection: { anchor: target },
			effects: EditorView.scrollIntoView(target, { y: "nearest" }),
		});
		return true;
	};
}

const EDITOR_SCROLL_HOST_SELECTOR = ".rfNodeNoteEditorBody";

function scrollOuterNoteBodyToCursor(update: ViewUpdate): void {
	if (!update.selectionSet) return;
	const scrollHost = update.view.dom.closest(EDITOR_SCROLL_HOST_SELECTOR);
	if (!(scrollHost instanceof HTMLElement)) return;

	try {
		const cursor = update.view.coordsAtPos(update.state.selection.main.head);
		if (!cursor) return;
		const hostBounds = scrollHost.getBoundingClientRect();
		if (cursor.top < hostBounds.top) {
			scrollHost.scrollTop += cursor.top - hostBounds.top;
		} else if (cursor.bottom > hostBounds.bottom) {
			scrollHost.scrollTop += cursor.bottom - hostBounds.bottom;
		}
	} catch {
		// CodeMirror can have no measurable cursor while the editor is unmounting.
	}
}

export function createRawMarkdownExtensions(
	onChange: () => void,
	getRelPath: () => string,
	vimMode: Extension,
): Extension[] {
	return [
		vimMode,
		highlightSpecialChars(),
		history(),
		drawSelection(),
		dropCursor(),
		EditorState.allowMultipleSelections.of(true),
		indentOnInput(),
		bracketMatching(),
		latexHoverTooltip,
		closeBrackets(),
		autocompletion({
			override: [
				latexSnippetCompletionSource,
				embeddedLatexCompletionSource,
				createRawLinkCompletionSource(getRelPath),
			],
			defaultKeymap: false,
			icons: false,
			maxRenderedOptions: 8,
		}),
		rectangularSelection(),
		search({ top: true }),
		highlightSelectionMatches(),
		markdown({
			base: markdownLanguage,
			codeLanguages: languages,
			extensions: [markdownMathExtension],
			pasteURLAsLink: true,
		}),
		syntaxHighlighting(markdownHighlightStyle),
		linter(embeddedMathLinter, { delay: 300 }),
		createRawMarkdownDecorations(getRelPath),
		EditorView.lineWrapping,
		EditorView.contentAttributes.of({
			"aria-label": "Raw Markdown editor",
			"aria-multiline": "true",
			autocapitalize: "sentences",
		}),
		EditorView.updateListener.of((update) => {
			const isExternalUpdate = update.transactions.some(
				(transaction) =>
					transaction.annotation(externalRawMarkdownUpdate) === true,
			);
			if (update.docChanged && !isExternalUpdate) {
				onChange();
			}
		}),
		keymap.of([
			...completionKeymap,
			{ key: "Mod-b", run: wrapSelection("**") },
			{ key: "Mod-i", run: wrapSelection("*") },
			{ key: "Mod-Shift-x", run: wrapSelection("~~") },
			{ key: "Mod-Shift-m", run: wrapSelection("$") },
			{ key: "Mod-Enter", run: toggleTaskAtCursor },
			{ key: "Tab", run: moveTableCell(1) },
			{ key: "Shift-Tab", run: moveTableCell(-1) },
			...closeBracketsKeymap,
			...searchKeymap,
			...historyKeymap,
			indentWithTab,
			...defaultKeymap,
		]),
	];
}

export function createRawMarkdownVimMode(enabled: boolean): Extension {
	return enabled
		? [
				vim({ status: true }),
				EditorView.updateListener.of(scrollOuterNoteBodyToCursor),
			]
		: [];
}
