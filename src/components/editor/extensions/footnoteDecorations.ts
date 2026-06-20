import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
	type ChangedRange,
	changedRangesFromTransactions,
	mergeChangedRanges,
} from "./changedRanges";

// Matches a footnote token such as `[^1]` or `[^note]`. The id may not contain
// whitespace or closing brackets, mirroring the raw-mode footnote highlighter.
const FOOTNOTE_PATTERN = /\[\^([^\]\s]+)\]/g;

const pluginKey = new PluginKey("footnote-decorations");

function footnoteDecorationsForTextNode(
	node: Node,
	pos: number,
	parent: Node | null,
): Decoration[] {
	const decorations: Decoration[] = [];
	const text = node.text;
	if (!node.isText || !text) return decorations;
	if (parent?.type.name === "codeBlock") return decorations;
	if (node.marks.some((mark) => mark.type.name === "code")) return decorations;

	const isFirstChild = parent?.firstChild === node;

	FOOTNOTE_PATTERN.lastIndex = 0;
	for (const match of text.matchAll(FOOTNOTE_PATTERN)) {
		const id = match[1];
		if (!id) continue;
		const start = match.index ?? 0;
		const end = start + match[0].length;
		const from = pos + start;
		const to = pos + end;
		// A definition is the leading `[^id]:` marker of a block.
		const isDefinition = isFirstChild && start === 0 && text[end] === ":";
		decorations.push(
			Decoration.inline(from, to, {
				class: isDefinition ? "footnoteDef" : "footnoteRef",
				"data-footnote-id": id,
			}),
		);
	}

	return decorations;
}

function buildDecorations(doc: Node): DecorationSet {
	const decorations: Decoration[] = [];
	doc.descendants((node, pos, parent) => {
		decorations.push(...footnoteDecorationsForTextNode(node, pos, parent));
	});
	return DecorationSet.create(doc, decorations);
}

function expandRangesToTextblocks(
	doc: Node,
	ranges: readonly ChangedRange[],
): ChangedRange[] {
	const expanded: ChangedRange[] = [];
	for (const range of ranges) {
		doc.nodesBetween(range.from, range.to, (node, pos) => {
			if (!node.isTextblock) return;
			expanded.push({ from: pos, to: pos + node.nodeSize });
			return false;
		});
	}
	return mergeChangedRanges(expanded.length ? expanded : ranges);
}

function buildDecorationsInRanges(
	doc: Node,
	ranges: readonly ChangedRange[],
): Decoration[] {
	const decorations: Decoration[] = [];
	const seen = new Set<number>();
	for (const range of ranges) {
		doc.nodesBetween(range.from, range.to, (node, pos, parent) => {
			if (seen.has(pos)) return false;
			seen.add(pos);
			decorations.push(...footnoteDecorationsForTextNode(node, pos, parent));
		});
	}
	return decorations;
}

function updateDecorations(
	tr: Transaction,
	decorations: DecorationSet,
): DecorationSet {
	const changedRanges = changedRangesFromTransactions(
		[tr],
		tr.doc.content.size,
	);
	if (!changedRanges.length) return decorations.map(tr.mapping, tr.doc);
	const scanRanges = expandRangesToTextblocks(tr.doc, changedRanges);
	const mapped = decorations.map(tr.mapping, tr.doc);
	const staleDecorations = scanRanges.flatMap((range) =>
		mapped.find(range.from, range.to),
	);
	const nextDecorations = buildDecorationsInRanges(tr.doc, scanRanges);
	return mapped.remove(staleDecorations).add(tr.doc, nextDecorations);
}

export const FootnoteDecorations = Extension.create({
	name: "footnote-decorations",
	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: pluginKey,
				state: {
					init(_: unknown, state: EditorState) {
						return buildDecorations(state.doc);
					},
					apply(tr: Transaction, old: DecorationSet) {
						if (!tr.docChanged) return old.map(tr.mapping, tr.doc);
						return updateDecorations(tr, old);
					},
				},
				props: {
					decorations(state) {
						return pluginKey.getState(state);
					},
				},
			}),
		];
	},
});
