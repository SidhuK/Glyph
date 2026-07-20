import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Selection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { type FocusMode, isFocusMode } from "../../../lib/settings";

interface FocusRange {
	from: number;
	to: number;
}

type WritingUnit = FocusRange[];

interface FocusModePluginState {
	decorations: DecorationSet;
	focusMode: FocusMode;
}

const focusModePluginKey = new PluginKey<FocusModePluginState>(
	"focus-mode-decorations",
);

function rangesIntersect(first: FocusRange, second: FocusRange): boolean {
	return first.from < second.to && second.from < first.to;
}

function isListItem(node: ProseMirrorNode): boolean {
	return node.type.name === "listItem" || node.type.name === "taskItem";
}

function isListContainer(node: ProseMirrorNode): boolean {
	const name = node.type.name;
	return name === "bulletList" || name === "orderedList" || name === "taskList";
}

function hasListItemAncestor(doc: ProseMirrorNode, pos: number): boolean {
	const resolved = doc.resolve(pos);
	for (let depth = resolved.depth; depth > 0; depth -= 1) {
		if (isListItem(resolved.node(depth))) return true;
	}
	return false;
}

function listItemRanges(node: ProseMirrorNode, pos: number): FocusRange[] {
	const ranges: FocusRange[] = [];
	node.forEach((child, offset) => {
		if (isListContainer(child)) return;
		const range = {
			from: pos + offset + 2,
			to: pos + offset + child.nodeSize,
		};
		if (range.from < range.to) ranges.push(range);
	});
	return ranges;
}

function sentenceRanges(text: string, from: number): FocusRange[] {
	if (typeof Intl.Segmenter === "function") {
		return Array.from(
			new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(text),
			({ index, segment }) => ({
				from: from + index,
				to: from + index + segment.length,
			}),
		).filter((range) => range.from < range.to);
	}

	const ranges: FocusRange[] = [];
	const punctuation = /[.!?]+(?:\s+|$)/g;
	let start = 0;
	for (const match of text.matchAll(punctuation)) {
		const end = (match.index ?? start) + match[0].length;
		ranges.push({ from: from + start, to: from + end });
		start = end;
	}
	if (start < text.length) {
		ranges.push({ from: from + start, to: from + text.length });
	}
	return ranges;
}

function codeLineRanges(node: ProseMirrorNode, from: number): FocusRange[] {
	const ranges: FocusRange[] = [];
	const text = node.textContent;
	let start = 0;
	for (const line of text.split("\n")) {
		ranges.push({ from: from + start, to: from + start + line.length });
		start += line.length + 1;
	}
	return ranges;
}

function writingUnits(
	doc: ProseMirrorNode,
	focusMode: FocusMode,
): WritingUnit[] {
	const units: WritingUnit[] = [];
	doc.descendants((node, pos, parent) => {
		const contentRange = { from: pos + 1, to: pos + node.content.size + 1 };
		if (isListItem(node)) {
			units.push(listItemRanges(node, pos));
			return;
		}
		if (hasListItemAncestor(doc, pos)) return;
		if (node.type.name === "blockquote" && focusMode === "paragraph") {
			units.push([contentRange]);
			return false;
		}
		if (node.type.name === "codeBlock") {
			units.push(
				...(focusMode === "sentence"
					? codeLineRanges(node, pos + 1).map((range) => [range])
					: [[contentRange]]),
			);
			return false;
		}
		if (!node.isTextblock) return;
		if (
			focusMode === "sentence" &&
			node.type.name === "paragraph" &&
			parent?.type.name !== "blockquote"
		) {
			units.push(
				...sentenceRanges(node.textContent, pos + 1).map((range) => [range]),
			);
			return;
		}
		units.push([contentRange]);
	});
	return units;
}

function activeRanges(
	doc: ProseMirrorNode,
	selection: Selection,
	focusMode: FocusMode,
): FocusRange[] {
	const units = writingUnits(doc, focusMode);
	if (selection.from !== selection.to) {
		return units
			.filter((unit) => unit.some((range) => rangesIntersect(range, selection)))
			.flat()
			.sort((first, second) => first.from - second.from);
	}

	const caret = selection.from;
	const containingUnit = units.find((unit) =>
		unit.some((range) => range.from <= caret && caret < range.to),
	);
	if (containingUnit) return containingUnit;
	let precedingUnit: WritingUnit | null = null;
	for (const unit of units) {
		if (unit.some((range) => range.from < caret && caret <= range.to)) {
			precedingUnit = unit;
		}
	}
	return precedingUnit ?? [];
}

function inactiveDecorations(
	doc: ProseMirrorNode,
	active: FocusRange[],
): Decoration[] {
	const decorations: Decoration[] = [];
	let activeIndex = 0;
	const addInactive = (from: number, to: number) => {
		if (from < to)
			decorations.push(
				Decoration.inline(from, to, { class: "focusModeInactive" }),
			);
	};
	doc.descendants((node, pos) => {
		if (!node.isText || !node.text) return;
		const textEnd = pos + node.text.length;
		while (active[activeIndex]?.to <= pos) activeIndex += 1;
		let cursor = pos;
		let index = activeIndex;
		while (active[index] && active[index].from < textEnd) {
			addInactive(cursor, Math.min(active[index].from, textEnd));
			cursor = Math.max(cursor, Math.min(active[index].to, textEnd));
			if (active[index].to > textEnd) break;
			index += 1;
		}
		addInactive(cursor, textEnd);
		activeIndex = index;
	});
	return decorations;
}

function buildFocusDecorations(
	doc: ProseMirrorNode,
	selection: Selection,
	focusMode: FocusMode,
): DecorationSet {
	if (focusMode === "off") return DecorationSet.empty;
	return DecorationSet.create(
		doc,
		inactiveDecorations(doc, activeRanges(doc, selection, focusMode)),
	);
}

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		focusMode: {
			setFocusMode: (focusMode: FocusMode) => ReturnType;
		};
	}
}

export const FocusModeDecorations = Extension.create({
	name: "focus-mode-decorations",

	addCommands() {
		return {
			setFocusMode:
				(focusMode: FocusMode) =>
				({ tr, dispatch }) => {
					dispatch?.(tr.setMeta(focusModePluginKey, focusMode));
					return true;
				},
		};
	},

	addProseMirrorPlugins() {
		return [
			new Plugin<FocusModePluginState>({
				key: focusModePluginKey,
				state: {
					init: () => ({
						focusMode: "off",
						decorations: DecorationSet.empty,
					}),
					apply(transaction, value, _oldState, newState) {
						const meta = transaction.getMeta(focusModePluginKey);
						const focusMode = isFocusMode(meta) ? meta : value.focusMode;
						if (
							focusMode === value.focusMode &&
							!transaction.docChanged &&
							!transaction.selectionSet
						) {
							return value;
						}
						return {
							focusMode,
							decorations: buildFocusDecorations(
								newState.doc,
								newState.selection,
								focusMode,
							),
						};
					},
				},
				props: {
					decorations(state) {
						return focusModePluginKey.getState(state)?.decorations ?? null;
					},
				},
			}),
		];
	},
});
