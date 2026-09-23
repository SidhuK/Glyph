import { Node, type MarkdownToken } from "@tiptap/core";

const HTML_COMMENT_RE = /^ {0,3}<!--[\s\S]*?-->$/;
const INLINE_COMMENT_RE = /^<!--[\s\S]*?-->/;
const BLOCK_COMMENT_RE = /^ {0,3}<!--[\s\S]*?-->[\t ]*(?:\n|$)/;
const BLOCK_COMMENT_START_RE = /^ {0,3}<!--/;

function isHtmlCommentSource(value: unknown): value is string {
	return typeof value === "string" && HTML_COMMENT_RE.test(value);
}

function commentFromToken(token: MarkdownToken): string {
	return commentRaw((token.raw ?? token.text ?? "").trimEnd());
}

function commentStart(source: string): number {
	return source.indexOf("<!--");
}

function commentRaw(value: unknown): string {
	if (!isHtmlCommentSource(value)) throw new Error("Invalid HTML comment node");
	return value;
}

function commentAttrsFromElement(element: HTMLElement): { raw: string } | false {
	const raw = element.textContent;
	return isHtmlCommentSource(raw) ? { raw } : false;
}

export const HtmlCommentInline = Node.create({
	name: "htmlCommentInline",
	group: "inline",
	inline: true,
	atom: true,
	markdownTokenName: "htmlCommentInline",
	addAttributes() {
		return { raw: { default: "" } };
	},
	parseHTML() {
		return [{ tag: "span[data-glyph-html-comment]", getAttrs: commentAttrsFromElement }];
	},
	renderHTML({ node }) {
		return [
			"span",
			{ "data-glyph-html-comment": "", class: "htmlComment" },
			commentRaw(node.attrs.raw),
		];
	},
	renderText({ node }) {
		return commentRaw(node.attrs.raw);
	},
	parseMarkdown(token, helpers) {
		return helpers.createNode("htmlCommentInline", { raw: commentFromToken(token) });
	},
	renderMarkdown(node) {
		return commentRaw(node.attrs?.raw);
	},
	markdownTokenizer: {
		name: "htmlCommentInline",
		level: "inline",
		start: commentStart,
		tokenize(source) {
			const match = source.match(INLINE_COMMENT_RE);
			return match ? { type: "htmlCommentInline", raw: match[0], text: match[0] } : undefined;
		},
	},
});

export const HtmlCommentBlock = Node.create({
	name: "htmlCommentBlock",
	group: "block",
	atom: true,
	markdownTokenName: "htmlCommentBlock",
	addAttributes() {
		return { raw: { default: "" } };
	},
	parseHTML() {
		return [{ tag: "div[data-glyph-html-comment]", getAttrs: commentAttrsFromElement }];
	},
	renderHTML({ node }) {
		return [
			"div",
			{ "data-glyph-html-comment": "", class: "htmlComment" },
			commentRaw(node.attrs.raw),
		];
	},
	renderText({ node }) {
		return commentRaw(node.attrs.raw);
	},
	parseMarkdown(token, helpers) {
		return helpers.createNode("htmlCommentBlock", { raw: commentFromToken(token) });
	},
	renderMarkdown(node) {
		return commentRaw(node.attrs?.raw);
	},
	markdownTokenizer: {
		name: "htmlCommentBlock",
		level: "block",
		start(source) {
			return BLOCK_COMMENT_START_RE.test(source) ? 0 : -1;
		},
		tokenize(source) {
			const match = source.match(BLOCK_COMMENT_RE);
			return match ? { type: "htmlCommentBlock", raw: match[0], text: match[0] } : undefined;
		},
	},
});
