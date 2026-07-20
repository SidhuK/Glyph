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

interface FocusModePluginState {
	decorations: DecorationSet;
	focusMode: FocusMode;
}

interface SentenceSegment {
	index: number;
	segment: string;
}

interface SentenceSegmenter {
	segment(input: string): Iterable<SentenceSegment>;
}

type SentenceSegmenterConstructor = new (
	locales: string | undefined,
	options: { granularity: "sentence" },
) => SentenceSegmenter;

const focusModePluginKey = new PluginKey<FocusModePluginState>(
	"focus-mode-decorations",
);

function isSentenceSegmenterConstructor(
	value: unknown,
): value is SentenceSegmenterConstructor {
	return typeof value === "function";
}

function rangesIntersect(first: FocusRange, second: FocusRange): boolean {
	return first.from < second.to && second.from < first.to;
}

function isContainedBy(range: FocusRange, container: FocusRange): boolean {
	return container.from <= range.from && range.to <= container.to;
}

function sentenceRanges(text: string, from: number): FocusRange[] {
	const Segmenter = Reflect.get(Intl, "Segmenter");
	if (isSentenceSegmenterConstructor(Segmenter)) {
		return Array.from(
			new Segmenter(undefined, { granularity: "sentence" }).segment(text),
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
): FocusRange[] {
	const listItems: FocusRange[] = [];
	const blockquotes: FocusRange[] = [];
	doc.descendants((node, pos) => {
		const range = { from: pos + 1, to: pos + node.content.size + 1 };
		if (node.type.name === "listItem" || node.type.name === "taskItem") {
			listItems.push(range);
		}
		if (node.type.name === "blockquote") blockquotes.push(range);
	});

	const units: FocusRange[] = [];
	doc.descendants((node, pos) => {
		const contentRange = { from: pos + 1, to: pos + node.content.size + 1 };
		if (node.type.name === "listItem" || node.type.name === "taskItem") {
			units.push(contentRange);
			return false;
		}
		if (node.type.name === "blockquote" && focusMode === "paragraph") {
			units.push(contentRange);
			return false;
		}
		if (node.type.name === "codeBlock") {
			units.push(
				...(focusMode === "sentence"
					? codeLineRanges(node, pos + 1)
					: [contentRange]),
			);
			return false;
		}
		if (!node.isTextblock) return;
		if (
			listItems.some((listItem) => isContainedBy(contentRange, listItem)) ||
			(focusMode === "paragraph" &&
				blockquotes.some((blockquote) =>
					isContainedBy(contentRange, blockquote),
				))
		) {
			return;
		}
		if (focusMode === "sentence" && node.type.name === "paragraph") {
			units.push(...sentenceRanges(node.textContent, pos + 1));
			return;
		}
		units.push(contentRange);
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
		return units.filter((unit) => rangesIntersect(unit, selection));
	}

	const caret = selection.from;
	const containingUnit = units.find(
		(unit) => unit.from <= caret && caret < unit.to,
	);
	if (containingUnit) return [containingUnit];
	let precedingUnit: FocusRange | null = null;
	for (const unit of units) {
		if (unit.from < caret && caret <= unit.to) precedingUnit = unit;
	}
	return precedingUnit ? [precedingUnit] : [];
}

function inactiveTextRanges(
	doc: ProseMirrorNode,
	active: FocusRange[],
): FocusRange[] {
	const inactive: FocusRange[] = [];
	doc.descendants((node, pos) => {
		if (!node.isText || !node.text) return;
		const textRange = { from: pos, to: pos + node.text.length };
		const intersections = active
			.map((range) => ({
				from: Math.max(range.from, textRange.from),
				to: Math.min(range.to, textRange.to),
			}))
			.filter((range) => range.from < range.to)
			.sort((first, second) => first.from - second.from);
		let cursor = textRange.from;
		for (const range of intersections) {
			if (cursor < range.from) inactive.push({ from: cursor, to: range.from });
			cursor = Math.max(cursor, range.to);
		}
		if (cursor < textRange.to)
			inactive.push({ from: cursor, to: textRange.to });
	});
	return inactive;
}

function buildFocusDecorations(
	doc: ProseMirrorNode,
	selection: Selection,
	focusMode: FocusMode,
): DecorationSet {
	if (focusMode === "off") return DecorationSet.empty;
	return DecorationSet.create(
		doc,
		inactiveTextRanges(doc, activeRanges(doc, selection, focusMode)).map(
			(range) =>
				Decoration.inline(range.from, range.to, {
					class: "focusModeInactive",
				}),
		),
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
