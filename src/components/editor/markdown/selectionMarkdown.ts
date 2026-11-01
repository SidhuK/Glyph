import type { Editor, JSONContent } from "@tiptap/core";
import type { Fragment, Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { stripHtmlEmbedRawSentinel } from "../../../lib/htmlEmbed";
import { normalizeBody, postprocessMarkdownFromEditor } from "./editorMarkdownBridge";

/**
 * Serializes block-level editor content to the same markdown the note is saved
 * as, without surrounding blank lines.
 */
export function blocksToMarkdown(editor: Editor, content: JSONContent[]): string {
	if (!editor.markdown) throw new Error("Markdown serializer is unavailable.");
	const markdown = editor.markdown.serialize({ type: "doc", content });
	return normalizeBody(postprocessMarkdownFromEditor(markdown)).replace(/^\n+|\n+$/g, "");
}

/**
 * The textblock a slice sits entirely inside, such as a few words of one
 * heading, list item, table cell or code block. Its wrappers are not part of
 * what the user selected.
 */
function enclosingTextblock(slice: Slice): ProseMirrorNode | null {
	let content: Fragment = slice.content;
	for (let depth = Math.min(slice.openStart, slice.openEnd); depth > 0; depth -= 1) {
		const node = content.firstChild;
		if (content.childCount !== 1 || !node) return null;
		if (node.isTextblock) return node;
		content = node.content;
	}
	return null;
}

/** Markdown for a selection slice, as copied to the clipboard or extracted to a note. */
export function sliceToMarkdown(editor: Editor, slice: Slice): string {
	const textblock = enclosingTextblock(slice);
	if (!textblock) {
		const blocks: JSONContent[] | null = slice.content.toJSON();
		return blocks ? blocksToMarkdown(editor, blocks) : "";
	}
	if (textblock.type.spec.code) return stripHtmlEmbedRawSentinel(textblock.textContent);
	const inline: JSONContent[] | null = textblock.content.toJSON();
	return inline ? blocksToMarkdown(editor, [{ type: "paragraph", content: inline }]) : "";
}
