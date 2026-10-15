import { Markdown } from "@tiptap/markdown";

// TipTap entity-encodes every `&`, `<` and `>` in plain text on save (#649). Undo that, then
// re-encode only the spots that would change meaning when the markdown is parsed again.
const TIPTAP_TEXT_ENTITY_RE = /&(amp|lt|gt);/g;
const ENTITY_LIKE_AMPERSAND_RE = /&(?=#?[A-Za-z0-9]+;)/g;
const TAG_LIKE_LESS_THAN_RE = /<(?=[A-Za-z/!?])/g;
const BLOCKQUOTE_LIKE_GREATER_THAN_RE = /^>/;

function decodeTipTapTextEntity(_match: string, name: string): string {
	if (name === "amp") return "&";
	if (name === "lt") return "<";
	return ">";
}

export function narrowMarkdownTextEncoding(encoded: string): string {
	return encoded
		.replace(TIPTAP_TEXT_ENTITY_RE, decodeTipTapTextEntity)
		.replace(ENTITY_LIKE_AMPERSAND_RE, "&amp;")
		.replace(TAG_LIKE_LESS_THAN_RE, "&lt;")
		.replace(BLOCKQUOTE_LIKE_GREATER_THAN_RE, "&gt;");
}

export const GlyphMarkdown = Markdown.extend({
	onBeforeCreate(event) {
		this.parent?.(event);
		const manager = this.storage.manager;
		const encodeText: unknown = Reflect.get(manager, "encodeTextForMarkdown");
		if (typeof encodeText !== "function") {
			throw new Error("@tiptap/markdown no longer has encodeTextForMarkdown");
		}
		Reflect.set(manager, "encodeTextForMarkdown", (text: string, ...context: unknown[]) => {
			const encoded: unknown = Reflect.apply(encodeText, manager, [text, ...context]);
			if (typeof encoded !== "string") {
				throw new Error("@tiptap/markdown encodeTextForMarkdown returned a non-string");
			}
			// Unchanged output means code text or nothing to escape; either way it stays literal.
			if (encoded === text) return text;
			return narrowMarkdownTextEncoding(encoded);
		});
	},
});
