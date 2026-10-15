import type {
	JSONContent,
	MarkdownParseHelpers,
	MarkdownRendererHelpers,
	MarkdownToken,
	MarkdownTokenizer,
} from "@tiptap/core";
import {
	createMarkdownFenceTracker,
	isInsideMarkdownCodeFence,
	type MarkdownFenceTracker,
	maskInlineCode,
	updateMarkdownFenceTracker,
} from "./markdownFence";

const DETAILS_OPEN_TAG_RE = /^ {0,3}<details(?=[\s/>])[^>]*>/i;
const DETAILS_START_RE = /^ {0,3}<details(?=[\s/>])/im;
const DETAILS_TAG_RE = /<\/?details(?=[\s/>])[^>]*>/gi;
const DETAILS_OR_SUMMARY_RE =
	/<\/?details(?=[\s/>])[^>]*>|<summary(?=[\s/>])[^>]*>[\s\S]*?<\/summary\s*>/gi;
const SUMMARY_TAGS_RE = /^<summary[^>]*>|<\/summary\s*>$/gi;
const QUOTED_ATTR_VALUE_RE = /"[^"]*"|'[^']*'/g;
const OPEN_ATTR_RE = /\sopen(?=[\s=/>])/i;

function escapeHtmlText(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function htmlFragmentToPlainText(html: string): string {
	if (!html.trim() || typeof DOMParser === "undefined") return html.trim();
	const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
	return doc.body.textContent?.trim() ?? html.trim();
}

/** Blanks out fenced and inline code so tags inside code are not matched. */
function maskCodeLine(line: string, fence: MarkdownFenceTracker): string {
	if (updateMarkdownFenceTracker(line, fence) || isInsideMarkdownCodeFence(fence)) {
		return " ".repeat(line.length);
	}
	return maskInlineCode(line);
}

/** Finds the `</details>` that closes the block opening `src`. */
function findDetailsClose(src: string): { start: number; end: number } | null {
	const fence = createMarkdownFenceTracker();
	let depth = 0;
	let lineStart = 0;
	for (;;) {
		const newline = src.indexOf("\n", lineStart);
		const line = src.slice(lineStart, newline === -1 ? src.length : newline);
		for (const tag of maskCodeLine(line, fence).matchAll(DETAILS_TAG_RE)) {
			depth += tag[0].startsWith("</") ? -1 : 1;
			if (depth === 0) {
				const start = lineStart + tag.index;
				return { start, end: start + tag[0].length };
			}
		}
		if (newline === -1) return null;
		lineStart = newline + 1;
	}
}

/** Takes out the block's own `<summary>`, skipping summaries of nested blocks. */
function splitSummary(inner: string): { summary: string; body: string } {
	const fence = createMarkdownFenceTracker();
	const masked = inner
		.split("\n")
		.map((line) => maskCodeLine(line, fence))
		.join("\n");
	let depth = 0;
	for (const tag of masked.matchAll(DETAILS_OR_SUMMARY_RE)) {
		if (/^<\/details/i.test(tag[0])) depth -= 1;
		else if (/^<details/i.test(tag[0])) depth += 1;
		else if (depth === 0) {
			const end = tag.index + tag[0].length;
			return {
				summary: htmlFragmentToPlainText(inner.slice(tag.index, end).replace(SUMMARY_TAGS_RE, "")),
				body: inner.slice(0, tag.index) + inner.slice(end),
			};
		}
	}
	return { summary: "", body: inner };
}

export const detailsMarkdownTokenizer: MarkdownTokenizer = {
	name: "details",
	level: "block",
	start(src) {
		return DETAILS_START_RE.exec(src)?.index ?? -1;
	},
	tokenize(src, _tokens, lexer) {
		const openTag = DETAILS_OPEN_TAG_RE.exec(src);
		if (!openTag) return undefined;
		const close = findDetailsClose(src);
		if (!close) return undefined;
		const { summary, body } = splitSummary(src.slice(openTag[0].length, close.start));
		return {
			type: "details",
			raw: src.slice(0, close.end),
			open: OPEN_ATTR_RE.test(openTag[0].replace(QUOTED_ATTR_VALUE_RE, "")),
			summary,
			// Inside list items marked emits loose `text` tokens instead of paragraphs.
			tokens: lexer
				.blockTokens(body)
				.map((token) => (token.type === "text" ? { ...token, type: "paragraph" } : token)),
		};
	},
};

export function parseDetailsMarkdown(token: MarkdownToken, h: MarkdownParseHelpers): JSONContent {
	const summary = typeof token.summary === "string" ? token.summary : "";
	const content = h.parseChildren(token.tokens ?? []);
	return h.createNode("details", { open: token.open === true }, [
		h.createNode("detailsSummary", {}, summary ? [h.createTextNode(summary)] : []),
		h.createNode("detailsContent", {}, content.length ? content : [h.createNode("paragraph")]),
	]);
}

export function renderDetailsMarkdown(node: JSONContent, h: MarkdownRendererHelpers): string {
	const summary = node.content?.find((child) => child.type === "detailsSummary");
	const summaryText = summary?.content?.map((child) => child.text ?? "").join("") ?? "";
	// Render the content node itself so each paragraph sees its real previous sibling.
	const content = node.content?.filter((child) => child.type === "detailsContent") ?? [];
	const body = h.renderChildren(content).replace(/^\n+|\n+$/g, "");
	const blocks = [
		`<details${node.attrs?.open ? " open" : ""}>`,
		`<summary>${escapeHtmlText(summaryText)}</summary>`,
	];
	if (body.trim()) blocks.push("", body);
	blocks.push("", "</details>");
	return blocks.join("\n");
}

export function renderDetailsContentMarkdown(
	node: JSONContent,
	h: MarkdownRendererHelpers,
): string {
	return h.renderChildren(node.content ?? [], "\n\n");
}
