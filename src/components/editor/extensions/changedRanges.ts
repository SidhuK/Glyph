import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

export interface ChangedRange {
	from: number;
	to: number;
}

function remapPositionToFinalDoc(
	transactions: readonly Transaction[],
	transactionIndex: number,
	stepMapIndex: number,
	position: number,
	assoc: -1 | 1,
): number {
	let mappedPosition = position;
	const currentMaps = transactions[transactionIndex]?.mapping.maps ?? [];
	for (let index = stepMapIndex + 1; index < currentMaps.length; index += 1) {
		mappedPosition = currentMaps[index].map(mappedPosition, assoc);
	}
	for (
		let index = transactionIndex + 1;
		index < transactions.length;
		index += 1
	) {
		for (const stepMap of transactions[index].mapping.maps) {
			mappedPosition = stepMap.map(mappedPosition, assoc);
		}
	}
	return mappedPosition;
}

export function changedRangesFromTransactions(
	transactions: readonly Transaction[],
	docSize: number,
): ChangedRange[] {
	const ranges: ChangedRange[] = [];
	let hasDocChange = false;

	for (
		let transactionIndex = 0;
		transactionIndex < transactions.length;
		transactionIndex += 1
	) {
		const transaction = transactions[transactionIndex];
		if (!transaction.docChanged) continue;
		hasDocChange = true;
		for (
			let stepMapIndex = 0;
			stepMapIndex < transaction.mapping.maps.length;
			stepMapIndex += 1
		) {
			const stepMap = transaction.mapping.maps[stepMapIndex];
			stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
				const finalStart = remapPositionToFinalDoc(
					transactions,
					transactionIndex,
					stepMapIndex,
					newStart,
					-1,
				);
				const finalEnd = remapPositionToFinalDoc(
					transactions,
					transactionIndex,
					stepMapIndex,
					newEnd,
					1,
				);
				ranges.push({
					from: Math.max(0, Math.min(finalStart, finalEnd) - 1),
					to: Math.min(docSize, Math.max(finalStart, finalEnd) + 1),
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

export function visitNodesInRanges(
	state: EditorState,
	ranges: readonly ChangedRange[],
	visitor: Parameters<ProseMirrorNode["nodesBetween"]>[2],
): void {
	if (!ranges.length) return;

	const seen = new Set<number>();
	for (const range of ranges) {
		state.doc.nodesBetween(range.from, range.to, (node, pos, parent, index) => {
			if (seen.has(pos)) return;
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
