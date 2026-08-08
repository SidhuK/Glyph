import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

interface NoteSearchRange {
	from: number;
	to: number;
}

interface NoteSearchState {
	query: string;
	activeIndex: number;
}

interface NoteSearchPluginState extends NoteSearchState {
	decorations: DecorationSet;
}

const noteSearchPluginKey = new PluginKey<NoteSearchPluginState>("note-search");

/**
 * Case-insensitive, non-overlapping literal search.
 *
 * Lowercasing can change a string's length (`İ` lowercases to two code points),
 * so folded positions are mapped back to the bounds of the source character they
 * came from rather than used as offsets into the original text. Search's
 * `expand_text_matches` mirrors this exactly, so a match ordinal computed there
 * addresses the same occurrence here. Folding is locale-neutral for the same
 * reason — a Turkish locale would otherwise count different occurrences.
 */
export function findPlainTextSearchRanges(
	text: string,
	query: string,
	offset = 0,
) {
	const ranges: NoteSearchRange[] = [];
	if (!query || !text) return ranges;

	const folded: string[] = [];
	const sourceStart: number[] = [];
	const sourceEnd: number[] = [];
	let index = 0;
	for (const char of text) {
		const lowered = char.toLowerCase();
		const end = index + char.length;
		for (let i = 0; i < lowered.length; i += 1) {
			sourceStart.push(index);
			sourceEnd.push(end);
		}
		folded.push(lowered);
		index = end;
	}

	const haystack = folded.join("");
	const needle = Array.from(query, (char) => char.toLowerCase()).join("");
	let cursor = 0;
	while (cursor <= haystack.length - needle.length) {
		const found = haystack.indexOf(needle, cursor);
		if (found === -1) break;
		ranges.push({
			from: offset + sourceStart[found],
			to: offset + sourceEnd[found + needle.length - 1],
		});
		cursor = found + needle.length;
	}

	return ranges;
}

export function findNoteSearchRanges(
	doc: ProseMirrorNode,
	query: string,
): NoteSearchRange[] {
	const ranges: NoteSearchRange[] = [];
	if (!query) return ranges;

	doc.descendants((node, pos) => {
		if (!node.isText || !node.text) return;
		ranges.push(...findPlainTextSearchRanges(node.text, query, pos));
	});

	return ranges;
}

function buildSearchDecorations(
	doc: ProseMirrorNode,
	{ activeIndex, query }: NoteSearchState,
) {
	const ranges = findNoteSearchRanges(doc, query);
	if (!ranges.length) return DecorationSet.empty;

	return DecorationSet.create(
		doc,
		ranges.map((range, index) =>
			Decoration.inline(range.from, range.to, {
				class:
					index === activeIndex
						? "noteSearchMatch noteSearchMatchActive"
						: "noteSearchMatch",
			}),
		),
	);
}

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		noteSearch: {
			setNoteSearch: (state: NoteSearchState) => ReturnType;
		};
	}
}

export const NoteSearch = Extension.create({
	name: "note-search",

	addCommands() {
		return {
			setNoteSearch:
				(state: NoteSearchState) =>
				({ tr, dispatch }) => {
					dispatch?.(tr.setMeta(noteSearchPluginKey, state));
					return true;
				},
		};
	},

	addProseMirrorPlugins() {
		return [
			new Plugin<NoteSearchPluginState>({
				key: noteSearchPluginKey,
				state: {
					init: () => ({
						query: "",
						activeIndex: 0,
						decorations: DecorationSet.empty,
					}),
					apply(tr, value) {
						const next = tr.getMeta(noteSearchPluginKey);
						if (
							next &&
							typeof next.query === "string" &&
							typeof next.activeIndex === "number"
						) {
							return {
								...next,
								decorations: next.query
									? buildSearchDecorations(tr.doc, next)
									: DecorationSet.empty,
							};
						}
						if (!tr.docChanged || !value.query) return value;
						return {
							...value,
							decorations: buildSearchDecorations(tr.doc, value),
						};
					},
				},
				props: {
					decorations(state) {
						const searchState = noteSearchPluginKey.getState(state);
						return searchState?.decorations ?? DecorationSet.empty;
					},
				},
			}),
		];
	},
});
