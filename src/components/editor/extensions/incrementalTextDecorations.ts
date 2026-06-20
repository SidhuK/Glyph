import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { type Decoration, DecorationSet } from "@tiptap/pm/view";
import {
	type ChangedRange,
	changedRangesFromTransactions,
	mergeChangedRanges,
} from "./changedRanges";

export interface TextNodeDecorationContext {
	node: Node;
	pos: number;
	parent: Node | null;
}

function shouldSkipTextNode(node: Node, parent: Node | null): boolean {
	if (!node.isText || !node.text) return true;
	if (parent?.type.name === "codeBlock") return true;
	if (node.marks.some((mark) => mark.type.name === "code")) return true;
	return false;
}

function collectDecorationsForNode(
	doc: Node,
	pos: number,
	parent: Node | null,
	collect: (context: TextNodeDecorationContext) => Decoration[],
): Decoration[] {
	if (shouldSkipTextNode(doc, parent)) return [];
	return collect({ node: doc, pos, parent });
}

function buildDecorations(
	doc: Node,
	collect: (context: TextNodeDecorationContext) => Decoration[],
): DecorationSet {
	const decorations: Decoration[] = [];
	doc.descendants((node, pos, parent) => {
		decorations.push(...collectDecorationsForNode(node, pos, parent, collect));
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
	collect: (context: TextNodeDecorationContext) => Decoration[],
): Decoration[] {
	const decorations: Decoration[] = [];
	const seen = new Set<number>();
	for (const range of ranges) {
		doc.nodesBetween(range.from, range.to, (node, pos, parent) => {
			if (seen.has(pos)) return false;
			seen.add(pos);
			decorations.push(
				...collectDecorationsForNode(node, pos, parent, collect),
			);
		});
	}
	return decorations;
}

function updateDecorations(
	tr: Transaction,
	decorations: DecorationSet,
	collect: (context: TextNodeDecorationContext) => Decoration[],
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
	const nextDecorations = buildDecorationsInRanges(tr.doc, scanRanges, collect);
	return mapped.remove(staleDecorations).add(tr.doc, nextDecorations);
}

export function createIncrementalTextDecorationPlugin(options: {
	pluginKey: string;
	collectDecorations: (context: TextNodeDecorationContext) => Decoration[];
}): Plugin {
	const pluginKey = new PluginKey(options.pluginKey);
	const collect = options.collectDecorations;

	return new Plugin({
		key: pluginKey,
		state: {
			init(_: unknown, state: EditorState) {
				return buildDecorations(state.doc, collect);
			},
			apply(tr: Transaction, old: DecorationSet) {
				if (!tr.docChanged) return old.map(tr.mapping, tr.doc);
				return updateDecorations(tr, old, collect);
			},
		},
		props: {
			decorations(state) {
				return pluginKey.getState(state);
			},
		},
	});
}

export function createIncrementalTextDecorationExtension(options: {
	name: string;
	pluginKey: string;
	collectDecorations: (context: TextNodeDecorationContext) => Decoration[];
}) {
	return Extension.create({
		name: options.name,
		addProseMirrorPlugins() {
			return [createIncrementalTextDecorationPlugin(options)];
		},
	});
}
