import { Node, type MarkdownToken } from "@tiptap/core";

function commentFromToken(token: MarkdownToken): string {
	return (token.raw ?? token.text ?? "").trimEnd();
}

function commentStart(source: string): number {
	return source.indexOf("<!--");
}

function commentRaw(value: unknown): string {
	return typeof value === "string" ? value : "";
}

export const HtmlCommentInline = Node.create({
	name: "htmlCommentInline",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	markdownTokenName: "htmlCommentInline",
	addAttributes() {
		return { raw: { default: "" } };
	},
	parseHTML() {
		return [{ tag: "span[data-glyph-html-comment]", getAttrs: (element) => ({ raw: element.textContent ?? "" }) }];
	},
	renderHTML({ node }) {
		return ["span", { "data-glyph-html-comment": "", class: "htmlComment" }, commentRaw(node.attrs.raw)];
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
			const match = source.match(/^<!--[\s\S]*?-->/);
			return match ? { type: "htmlCommentInline", raw: match[0], text: match[0] } : undefined;
		},
	},
});

export const HtmlCommentBlock = Node.create({
	name: "htmlCommentBlock",
	group: "block",
	atom: true,
	selectable: true,
	markdownTokenName: "htmlCommentBlock",
	addAttributes() {
		return { raw: { default: "" } };
	},
	parseHTML() {
		return [{ tag: "div[data-glyph-html-comment]", getAttrs: (element) => ({ raw: element.textContent ?? "" }) }];
	},
	renderHTML({ node }) {
		return ["div", { "data-glyph-html-comment": "", class: "htmlComment" }, commentRaw(node.attrs.raw)];
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
			return /^ {0,3}<!--/.test(source) ? 0 : -1;
		},
		tokenize(source) {
			const match = source.match(/^ {0,3}<!--[\s\S]*?-->[\t ]*(?:\n|$)/);
			return match ? { type: "htmlCommentBlock", raw: match[0], text: match[0] } : undefined;
		},
	},
});
