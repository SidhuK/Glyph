import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const TAG_PATTERN = /(^|[^\w/])#([A-Za-z0-9_][\w/-]*)/g;
const PERSON_PATTERN = /(^|[^A-Za-z0-9_.-])@([A-Za-z0-9_][A-Za-z0-9_-]*)/g;

const pluginKey = new PluginKey("tag-decorations");

function buildDecorations(doc: Node): DecorationSet {
	const decorations: Decoration[] = [];
	doc.descendants((node, pos, parent) => {
		if (!node.isText || !node.text) return;
		if (parent?.type.name === "codeBlock") return;
		if (node.marks.some((mark) => mark.type.name === "code")) return;

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
	});
	return DecorationSet.create(doc, decorations);
}

function buildDecorationsWithPeople(
	doc: Node,
	enablePeopleMentions: boolean,
): DecorationSet {
	if (!enablePeopleMentions) {
		const decorations: Decoration[] = [];
		doc.descendants((node, pos, parent) => {
			if (!node.isText || !node.text) return;
			if (parent?.type.name === "codeBlock") return;
			if (node.marks.some((mark) => mark.type.name === "code")) return;

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
		});
		return DecorationSet.create(doc, decorations);
	}
	return buildDecorations(doc);
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
						return buildDecorationsWithPeople(tr.doc, enablePeopleMentions);
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
