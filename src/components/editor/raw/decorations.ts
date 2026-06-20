import { syntaxTree } from "@codemirror/language";
import type { Range } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import {
	addGlyphInlineDecorations,
	findFrontmatterEnd,
} from "./contentDecorations";
import { createRawMarkdownEventHandlers } from "./interactions";
import { decorateRecognizedTable } from "./tableDecorations";

const CALLOUT_PATTERN = /^\s*>\s*\[!([\w-]+)\][+-]?/i;
const FRONTMATTER_KEY_PATTERN = /^(\s*)([A-Za-z_][\w.-]*)(\s*:)(\s*)/;
const FRONTMATTER_LIST_PATTERN = /^(\s*)(-)(\s+)/;

function normalizedCalloutKind(kind: string): string {
	const normalized = kind.toLowerCase();
	if (normalized === "warn" || normalized === "caution") return "warning";
	if (normalized === "danger" || normalized === "failure") return "error";
	if (normalized === "done" || normalized === "check") return "success";
	if (["info", "tip", "warning", "error", "success"].includes(normalized)) {
		return normalized;
	}
	return "note";
}

function lineNumbersForRange(view: EditorView, from: number, to: number) {
	const document = view.state.doc;
	const first = document.lineAt(from).number;
	const last = document.lineAt(Math.max(from, to - 1)).number;
	return { first, last };
}

function addLineDecoration(
	ranges: Range<Decoration>[],
	view: EditorView,
	lineNumber: number,
	className: string,
) {
	const line = view.state.doc.line(lineNumber);
	ranges.push(Decoration.line({ class: className }).range(line.from));
}

function decorateFrontmatter(
	ranges: Range<Decoration>[],
	view: EditorView,
	visibleFrom: number,
	visibleTo: number,
) {
	const document = view.state.doc;
	const end = findFrontmatterEnd(document);
	if (!end) return;
	for (let lineNumber = 1; lineNumber <= end; lineNumber += 1) {
		const line = document.line(lineNumber);
		if (line.to < visibleFrom || line.from > visibleTo) continue;
		const delimiter = line.text.trim() === "---";
		addLineDecoration(
			ranges,
			view,
			lineNumber,
			`cm-raw-frontmatter-line${delimiter ? " is-delimiter" : ""}`,
		);
		if (delimiter) {
			ranges.push(
				Decoration.mark({
					class: "cm-raw-syntax cm-raw-frontmatter-mark",
				}).range(line.from, line.to),
			);
			continue;
		}
		const key = line.text.match(FRONTMATTER_KEY_PATTERN);
		const list = line.text.match(FRONTMATTER_LIST_PATTERN);
		if (key) {
			const keyFrom = line.from + (key[1]?.length ?? 0);
			const keyTo = keyFrom + (key[2]?.length ?? 0);
			const valueFrom = line.from + key[0].length;
			ranges.push(
				Decoration.mark({ class: "cm-raw-frontmatter-key" }).range(
					keyFrom,
					keyTo,
				),
			);
			if (valueFrom < line.to) {
				ranges.push(
					Decoration.mark({ class: "cm-raw-frontmatter-value" }).range(
						valueFrom,
						line.to,
					),
				);
			}
		} else if (list) {
			const marker = line.from + (list[1]?.length ?? 0);
			const valueFrom = line.from + list[0].length;
			ranges.push(
				Decoration.mark({ class: "cm-raw-frontmatter-list-mark" }).range(
					marker,
					marker + 1,
				),
			);
			if (valueFrom < line.to) {
				ranges.push(
					Decoration.mark({ class: "cm-raw-frontmatter-value" }).range(
						valueFrom,
						line.to,
					),
				);
			}
		}
	}
}

function buildVisibleDecorations(view: EditorView): DecorationSet {
	const ranges: Range<Decoration>[] = [];
	const visibleFrom = view.visibleRanges[0]?.from ?? 0;
	const visibleTo =
		view.visibleRanges[view.visibleRanges.length - 1]?.to ??
		view.state.doc.length;
	const decoratedTables = new Set<number>();
	const frontmatterEnd = findFrontmatterEnd(view.state.doc);
	const frontmatterTo = frontmatterEnd
		? view.state.doc.line(frontmatterEnd).to
		: -1;

	syntaxTree(view.state).iterate({
		from: visibleFrom,
		to: visibleTo,
		enter(node) {
			const { name } = node.type;
			if (name !== "Document" && node.from <= frontmatterTo) return false;
			const heading = name.match(/^(?:ATXHeading|SetextHeading)([1-6])$/);
			if (heading?.[1]) {
				addLineDecoration(
					ranges,
					view,
					view.state.doc.lineAt(node.from).number,
					`cm-raw-heading cm-raw-heading-${heading[1]}`,
				);
				return;
			}
			if (name === "HeaderMark") {
				ranges.push(
					Decoration.mark({
						class: "cm-raw-syntax cm-raw-heading-mark",
					}).range(node.from, node.to),
				);
				return;
			}
			if (name === "FencedCode" || name === "CodeBlock") {
				const { first, last } = lineNumbersForRange(view, node.from, node.to);
				for (let lineNumber = first; lineNumber <= last; lineNumber += 1) {
					const line = view.state.doc.line(lineNumber);
					if (line.to < visibleFrom || line.from > visibleTo) continue;
					const edge =
						lineNumber === first
							? " is-fence is-opening"
							: lineNumber === last
								? " is-fence is-closing"
								: "";
					addLineDecoration(
						ranges,
						view,
						lineNumber,
						`cm-raw-code-line${edge}`,
					);
				}
				return;
			}
			if (name === "CodeMark" && node.node.parent?.name === "FencedCode") {
				ranges.push(
					Decoration.mark({
						class: "cm-raw-syntax cm-raw-code-fence",
					}).range(node.from, node.to),
				);
				return;
			}
			if (name === "Blockquote") {
				const { first, last } = lineNumbersForRange(view, node.from, node.to);
				const callout = view.state.doc.line(first).text.match(CALLOUT_PATTERN);
				const kind = callout?.[1] ? normalizedCalloutKind(callout[1]) : null;
				for (let lineNumber = first; lineNumber <= last; lineNumber += 1) {
					const line = view.state.doc.line(lineNumber);
					if (line.to < visibleFrom || line.from > visibleTo) continue;
					const calloutClass = kind
						? ` cm-raw-callout cm-raw-callout-${kind}${lineNumber === first ? " is-title" : ""}${lineNumber === last ? " is-end" : ""}`
						: "";
					addLineDecoration(
						ranges,
						view,
						lineNumber,
						`cm-raw-quote-line${calloutClass}`,
					);
				}
				if (callout) {
					const title = view.state.doc.line(first);
					const markerFrom = title.text.indexOf("[!");
					const markerTo = title.text.indexOf("]", markerFrom) + 1;
					if (markerFrom >= 0 && markerTo > markerFrom) {
						ranges.push(
							Decoration.mark({ class: "cm-raw-callout-marker" }).range(
								title.from + markerFrom,
								title.from + markerTo,
							),
						);
					}
				}
				return;
			}
			if (name === "QuoteMark" || name === "ListMark") {
				ranges.push(
					Decoration.mark({
						class:
							name === "ListMark"
								? "cm-raw-syntax cm-raw-list-mark"
								: "cm-raw-syntax",
					}).range(node.from, node.to),
				);
				return;
			}
			if (name === "ListItem") {
				addLineDecoration(
					ranges,
					view,
					view.state.doc.lineAt(node.from).number,
					"cm-raw-list-line",
				);
				return;
			}
			if (name === "TaskMarker") {
				const marker = view.state.doc.sliceString(node.from, node.to);
				const checked = /x/i.test(marker);
				ranges.push(
					Decoration.mark({
						class: "cm-raw-task-checkbox",
						attributes: {
							"data-task-marker-position": String(node.from),
							"data-checked": String(checked),
							role: "checkbox",
							"aria-checked": String(checked),
							"aria-label": checked
								? "Mark task incomplete"
								: "Mark task complete",
						},
					}).range(node.from, node.to),
				);
				if (checked) {
					const line = view.state.doc.lineAt(node.to);
					if (node.to < line.to) {
						ranges.push(
							Decoration.mark({
								class: "cm-raw-task-content is-checked",
							}).range(node.to, line.to),
						);
					}
				}
				return;
			}
			if (name === "HorizontalRule") {
				addLineDecoration(
					ranges,
					view,
					view.state.doc.lineAt(node.from).number,
					"cm-raw-horizontal-rule",
				);
				ranges.push(
					Decoration.mark({
						class: "cm-raw-syntax cm-raw-horizontal-rule-mark",
					}).range(node.from, node.to),
				);
				return;
			}
			if (name === "Table" && !decoratedTables.has(node.from)) {
				decoratedTables.add(node.from);
				decorateRecognizedTable(
					ranges,
					view,
					node.from,
					node.to,
					visibleFrom,
					visibleTo,
				);
				return;
			}
			if (name === "Link" || name === "Image" || name === "Autolink") {
				const url = node.node.getChild("URL");
				if (!url) return;
				const href = view.state.doc
					.sliceString(url.from, url.to)
					.replace(/^<|>$/g, "");
				ranges.push(
					Decoration.mark({
						class: `cm-raw-markdown-link${name === "Autolink" ? " cm-raw-bare-url" : ""}`,
						attributes: { "data-markdown-href": href },
					}).range(node.from, node.to),
				);
				return false;
			}
		},
	});

	decorateFrontmatter(ranges, view, visibleFrom, visibleTo);
	for (const visible of view.visibleRanges) {
		const first = view.state.doc.lineAt(visible.from).number;
		const last = view.state.doc.lineAt(visible.to).number;
		for (let lineNumber = first; lineNumber <= last; lineNumber += 1) {
			const line = view.state.doc.line(lineNumber);
			addGlyphInlineDecorations(ranges, view, line.from, line.text);
		}
	}
	return Decoration.set(ranges, true);
}

export function createRawMarkdownDecorations(getRelPath: () => string) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildVisibleDecorations(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = buildVisibleDecorations(update.view);
				}
			}
		},
		{
			decorations: (plugin) => plugin.decorations,
			eventHandlers: createRawMarkdownEventHandlers(getRelPath),
		},
	);
}
