import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const TAG_PATTERN = /(^|[^\w/])#([A-Za-z0-9_][\w/-]*)/g;

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
	});
	return DecorationSet.create(doc, decorations);
}

export const TagDecorations = Extension.create({
	name: "tag-decorations",
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
						return buildDecorations(tr.doc);
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
