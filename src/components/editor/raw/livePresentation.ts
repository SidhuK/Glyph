import { Facet, type Range } from "@codemirror/state";
import { Decoration, type EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

const HEADING_SPACE_PATTERN = /^[ \t]+/;
const BULLET_PATTERN = /^[-+*]$/;

export const rawMarkdownLivePreview = Facet.define<boolean, boolean>({
	combine: (values) => values.some(Boolean),
});

export function shouldConceal(view: EditorView, from: number, to: number): boolean {
	return (
		view.state.facet(rawMarkdownLivePreview) &&
		!view.state.selection.ranges.some((selection) => selection.from <= to && selection.to >= from)
	);
}

export function concealSyntax(
	ranges: Range<Decoration>[],
	view: EditorView,
	from: number,
	to: number,
): void {
	// View plugins cannot replace line breaks. Keep source lines and positions
	// intact, including multiline links and code fences. Do not add atomicRanges:
	// Vim and ordinary cursor movement must be able to enter every source offset.
	if (from < to && view.state.doc.lineAt(from).number === view.state.doc.lineAt(to).number) {
		ranges.push(Decoration.replace({ inclusive: false }).range(from, to));
	}
}

class ListBullet extends WidgetType {
	eq(other: WidgetType): boolean {
		return other instanceof ListBullet;
	}

	toDOM(): HTMLElement {
		const bullet = document.createElement("span");
		bullet.className = "cm-raw-live-bullet";
		bullet.textContent = "•";
		bullet.setAttribute("aria-hidden", "true");
		return bullet;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

export function addLiveSyntaxDecoration(
	ranges: Range<Decoration>[],
	view: EditorView,
	node: SyntaxNode,
): void {
	if (!view.state.facet(rawMarkdownLivePreview)) return;
	const parent = node.parent;
	if (!parent) return;
	for (let ancestor: SyntaxNode | null = parent; ancestor; ancestor = ancestor.parent) {
		if (
			ancestor.name === "FencedCode" ||
			ancestor.name === "CodeBlock" ||
			ancestor.name === "Image"
		) {
			return;
		}
	}
	const source = (from: number, to: number) => view.state.doc.sliceString(from, to);
	const hide = (from: number, to: number) => concealSyntax(ranges, view, from, to);
	const inactive = (from: number, to: number) => shouldConceal(view, from, to);

	if (node.name === "Link") {
		// Leave images, unresolved references, empty labels, and multiline links
		// as source. They have no safe inline text equivalent here.
		if (!node.getChild("URL")) return;
		const marks = node.getChildren("LinkMark");
		const opening = marks.find((mark) => source(mark.from, mark.to) === "[");
		const closing = marks.find((mark) => source(mark.from, mark.to) === "]");
		if (!opening || !closing || opening.to >= closing.from) return;
		if (view.state.doc.lineAt(node.from).number !== view.state.doc.lineAt(node.to).number) return;
		if (!inactive(node.from, node.to)) return;
		hide(opening.from, opening.to);
		hide(closing.from, node.to);
		return;
	}
	if (node.name === "Autolink" && inactive(node.from, node.to)) {
		hide(node.from, node.from + 1);
		hide(node.to - 1, node.to);
		return;
	}
	if (
		(node.name === "EmphasisMark" ||
			node.name === "StrikethroughMark" ||
			(node.name === "CodeMark" && parent.name === "InlineCode")) &&
		inactive(parent.from, parent.to)
	) {
		hide(node.from, node.to);
		return;
	}
	if (node.name === "HeaderMark" && inactive(parent.from, parent.to)) {
		const line = view.state.doc.lineAt(node.from);
		const followingSpace = source(node.to, line.to).match(HEADING_SPACE_PATTERN)?.[0].length ?? 0;
		hide(node.from, node.to + followingSpace);
		return;
	}
	if (node.name === "QuoteMark" && inactive(parent.from, parent.to)) {
		hide(node.from, node.to + (source(node.to, node.to + 1) === " " ? 1 : 0));
		return;
	}
	if (node.name === "ListMark" && inactive(parent.from, parent.to)) {
		if (BULLET_PATTERN.test(source(node.from, node.to))) {
			ranges.push(
				Decoration.replace({ widget: new ListBullet(), inclusive: false }).range(
					node.from,
					node.to,
				),
			);
		}
	}
	if (node.name === "HorizontalRule" && inactive(node.from, node.to)) {
		ranges.push(
			Decoration.line({ class: "cm-raw-live-rule" }).range(view.state.doc.lineAt(node.from).from),
		);
		hide(node.from, node.to);
	}
}
