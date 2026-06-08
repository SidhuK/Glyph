import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

export interface ChangedRange {
	from: number;
	to: number;
}

export function changedRangesFromTransactions(
	transactions: readonly Transaction[],
	docSize: number,
): ChangedRange[] {
	const ranges: ChangedRange[] = [];
	let hasDocChange = false;

	for (const transaction of transactions) {
		if (!transaction.docChanged) continue;
		hasDocChange = true;
		for (const stepMap of transaction.mapping.maps) {
			stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
				ranges.push({
					from: Math.max(0, Math.min(newStart, newEnd) - 1),
					to: Math.min(docSize, Math.max(newStart, newEnd) + 1),
				});
			});
		}
	}

	if (!ranges.length) {
		return hasDocChange ? [{ from: 0, to: docSize }] : [];
	}

	return mergeChangedRanges(ranges);
}

export function mergeChangedRanges(
	ranges: readonly ChangedRange[],
): ChangedRange[] {
	if (!ranges.length) return [];

	const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to);
	const merged: ChangedRange[] = [];
	for (const range of sorted) {
		const previous = merged[merged.length - 1];
		if (!previous || range.from > previous.to) {
			merged.push({ ...range });
			continue;
		}
		previous.to = Math.max(previous.to, range.to);
	}
	return merged;
}

// Deduped overlapping ranges skip a repeated node's subtree because returning
// false from nodesBetween prevents descent. Current callers either target
// paragraph nodes or independently scan inline text, so they do not rely on
// revisiting children from overlapping parent ranges.
export function visitNodesInRanges(
	state: EditorState,
	ranges: readonly ChangedRange[],
	visitor: Parameters<ProseMirrorNode["nodesBetween"]>[2],
): void {
	if (!ranges.length) return;

	const seen = new Set<number>();
	for (const range of ranges) {
		state.doc.nodesBetween(range.from, range.to, (node, pos, parent, index) => {
			if (seen.has(pos)) return false;
			seen.add(pos);
			return visitor(node, pos, parent, index);
		});
	}
}

export function visitChangedNodes(
	transactions: readonly Transaction[],
	state: EditorState,
	visitor: Parameters<ProseMirrorNode["nodesBetween"]>[2],
): void {
	visitNodesInRanges(
		state,
		changedRangesFromTransactions(transactions, state.doc.content.size),
		visitor,
	);
}
