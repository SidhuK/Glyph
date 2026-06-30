import { Decoration } from "@tiptap/pm/view";
import { FOOTNOTE_PATTERN, footnoteKindAt } from "../markdown/footnote";
import { createIncrementalTextDecorationExtension } from "./incrementalTextDecorations";

export const FootnoteDecorations = createIncrementalTextDecorationExtension({
	name: "footnote-decorations",
	pluginKey: "footnote-decorations",
	collectDecorations({ node, pos }) {
		const decorations: Decoration[] = [];
		const text = node.text;
		if (!text) return decorations;

		FOOTNOTE_PATTERN.lastIndex = 0;
		for (const match of text.matchAll(FOOTNOTE_PATTERN)) {
			const id = match[1];
			if (!id) continue;
			const start = match.index ?? 0;
			const end = start + match[0].length;
			const from = pos + start;
			const to = pos + end;
			const isDefinition =
				footnoteKindAt(text, start, match[0].length) === "def";
			decorations.push(
				Decoration.inline(from, to, {
					class: isDefinition ? "footnoteDef" : "footnoteRef",
					"data-footnote-id": id,
				}),
			);
		}

		return decorations;
	},
});
