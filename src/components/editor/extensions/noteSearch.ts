import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface NoteSearchRange {
	from: number;
	to: number;
}

interface NoteSearchState {
	query: string;
	activeIndex: number;
}

const noteSearchPluginKey = new PluginKey<NoteSearchState>("note-search");

export function findPlainTextSearchRanges(
	text: string,
	query: string,
	offset = 0,
) {
	const ranges: NoteSearchRange[] = [];
	if (!query) return ranges;

	const haystack = text.toLocaleLowerCase();
	const needle = query.toLocaleLowerCase();
	let startIndex = 0;

	while (startIndex <= haystack.length - needle.length) {
		const index = haystack.indexOf(needle, startIndex);
		if (index === -1) break;
		ranges.push({
			from: offset + index,
			to: offset + index + query.length,
		});
		startIndex = index + query.length;
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
			new Plugin<NoteSearchState>({
				key: noteSearchPluginKey,
				state: {
					init: () => ({ query: "", activeIndex: 0 }),
					apply(tr, value) {
						const next = tr.getMeta(noteSearchPluginKey);
						return next &&
							typeof next.query === "string" &&
							typeof next.activeIndex === "number"
							? next
							: value;
					},
				},
				props: {
					decorations(state) {
						const searchState = noteSearchPluginKey.getState(state);
						if (!searchState?.query) return DecorationSet.empty;
						return buildSearchDecorations(state.doc, searchState);
					},
				},
			}),
		];
	},
});
