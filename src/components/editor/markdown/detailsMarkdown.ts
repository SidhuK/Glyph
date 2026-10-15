import type {
	JSONContent,
	MarkdownParseHelpers,
	MarkdownRendererHelpers,
	MarkdownToken,
	MarkdownTokenizer,
} from "@tiptap/core";
import {
	createMarkdownFenceTracker,
	findInlineCodeClose,
	isInsideMarkdownCodeFence,
	updateMarkdownFenceTracker,
} from "./markdownFence";

const DETAILS_OPEN_TAG_RE = /^ {0,3}<details\b[^>]*>/i;
const DETAILS_START_RE = /^ {0,3}<details\b/im;
const DETAILS_TAG_RE = /<\/?details\b[^>]*>/gi;
const DETAILS_OPEN_ATTR_RE = /\sopen(?=[\s=/>])/i;
const SUMMARY_RE = /^\s*<summary\b[^>]*>([\s\S]*?)<\/summary>/i;

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

/** Blank out inline code spans so tags inside them are not counted. */
function maskInlineCode(line: string): string {
	let masked = "";
	let cursor = 0;
	while (cursor < line.length) {
		const tickStart = line.indexOf("`", cursor);
		if (tickStart === -1) break;
		const ticks = /^`+/.exec(line.slice(tickStart))?.[0].length ?? 1;
		const close = findInlineCodeClose(line, tickStart, ticks);
		const end = close === -1 ? tickStart + ticks : close + ticks;
		masked += line.slice(cursor, tickStart);
		masked += close === -1 ? line.slice(tickStart, end) : " ".repeat(end - tickStart);
		cursor = end;
	}
	return masked + line.slice(cursor);
}

/** Finds the `</details>` that closes the block opening `src`, skipping tags in code. */
function findDetailsClose(src: string): { start: number; end: number } | null {
	const fence = createMarkdownFenceTracker();
	let depth = 0;
	let lineStart = 0;
	for (;;) {
		const newline = src.indexOf("\n", lineStart);
		const line = src.slice(lineStart, newline === -1 ? src.length : newline);
		if (!updateMarkdownFenceTracker(line, fence) && !isInsideMarkdownCodeFence(fence)) {
			for (const tag of maskInlineCode(line).matchAll(DETAILS_TAG_RE)) {
				depth += tag[0].startsWith("</") ? -1 : 1;
				if (depth === 0) {
					const start = lineStart + tag.index;
					return { start, end: start + tag[0].length };
				}
			}
		}
		if (newline === -1) return null;
		lineStart = newline + 1;
	}
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
		const inner = src.slice(openTag[0].length, close.start);
		const summary = SUMMARY_RE.exec(inner);
		return {
			type: "details",
			raw: src.slice(0, close.end),
			open: DETAILS_OPEN_ATTR_RE.test(openTag[0]),
			summary: htmlFragmentToPlainText(summary?.[1] ?? ""),
			tokens: lexer.blockTokens(summary ? inner.slice(summary[0].length) : inner),
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
	const content = node.content?.find((child) => child.type === "detailsContent");
	const summaryText = summary?.content?.map((child) => child.text ?? "").join("") ?? "";
	const body = h.renderChildren(content?.content ?? [], "\n\n").replace(/^\n+|\n+$/g, "");
	const blocks = [
		`<details${node.attrs?.open ? " open" : ""}>`,
		`<summary>${escapeHtmlText(summaryText)}</summary>`,
	];
	if (body.trim()) blocks.push("", body);
	blocks.push("", "</details>");
	return blocks.join("\n");
}
