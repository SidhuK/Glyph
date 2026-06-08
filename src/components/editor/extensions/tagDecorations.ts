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

const TAG_PATTERN = /(^|[^\w/])#([A-Za-z0-9_][\w/-]*)/g;
const PERSON_PATTERN = /(^|[^A-Za-z0-9_.-])@([A-Za-z0-9_][A-Za-z0-9_-]*)/g;

const pluginKey = new PluginKey("tag-decorations");

function tagDecorationsForTextNode(
	node: Node,
	pos: number,
	parent: Node | null,
	enablePeopleMentions: boolean,
): Decoration[] {
	const decorations: Decoration[] = [];
	if (!node.isText || !node.text) return decorations;
	if (parent?.type.name === "codeBlock") return decorations;
	if (node.marks.some((mark) => mark.type.name === "code")) return decorations;

	TAG_PATTERN.lastIndex = 0;
	for (const match of node.text.matchAll(TAG_PATTERN)) {
		const leading = match[1] ?? "";
		const tag = match[2] ?? "";
		if (!tag) continue;
		const start = (match.index ?? 0) + leading.length;
		const from = pos + start;
		const to = from + 1 + tag.length;
		decorations.push(
			Decoration.inline(from, to, {
				class: "tagToken",
				"data-tag": tag,
			}),
		);
	}

	if (!enablePeopleMentions) return decorations;

	PERSON_PATTERN.lastIndex = 0;
	for (const match of node.text.matchAll(PERSON_PATTERN)) {
		const leading = match[1] ?? "";
		const handle = match[2] ?? "";
		if (!handle) continue;
		const start = (match.index ?? 0) + leading.length;
		const from = pos + start;
		const to = from + 1 + handle.length;
		decorations.push(
			Decoration.inline(from, to, {
				class: "personToken",
				"data-handle": handle,
			}),
		);
	}

	return decorations;
}

function buildDecorationsWithPeople(
	doc: Node,
	enablePeopleMentions: boolean,
): DecorationSet {
	const decorations: Decoration[] = [];
	doc.descendants((node, pos, parent) => {
		decorations.push(
			...tagDecorationsForTextNode(node, pos, parent, enablePeopleMentions),
		);
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
	enablePeopleMentions: boolean,
): Decoration[] {
	const decorations: Decoration[] = [];
	const seen = new Set<number>();
	for (const range of ranges) {
		doc.nodesBetween(range.from, range.to, (node, pos, parent) => {
			if (seen.has(pos)) return false;
			seen.add(pos);
			decorations.push(
				...tagDecorationsForTextNode(node, pos, parent, enablePeopleMentions),
			);
		});
	}
	return decorations;
}

function updateDecorationsWithPeople(
	tr: Transaction,
	decorations: DecorationSet,
	enablePeopleMentions: boolean,
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
	const nextDecorations = buildDecorationsInRanges(
		tr.doc,
		scanRanges,
		enablePeopleMentions,
	);
	return mapped.remove(staleDecorations).add(tr.doc, nextDecorations);
}

export const TagDecorations = Extension.create({
	name: "tag-decorations",
	addOptions() {
		return {
			enablePeopleMentions: false,
		};
	},
	addProseMirrorPlugins() {
		const enablePeopleMentions = Boolean(this.options.enablePeopleMentions);
		return [
			new Plugin({
				key: pluginKey,
				state: {
					init(_: unknown, state: EditorState) {
						return buildDecorationsWithPeople(state.doc, enablePeopleMentions);
					},
					apply(tr: Transaction, old: DecorationSet) {
						if (!tr.docChanged) return old.map(tr.mapping, tr.doc);
						return updateDecorationsWithPeople(tr, old, enablePeopleMentions);
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
