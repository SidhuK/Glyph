import {
	HTML_EMBED_RAW_SENTINEL,
	type HtmlEmbedKind,
	rawHtmlToFencedBlock,
} from "../../../lib/htmlEmbed";
import {
	createMarkdownFenceTracker,
	isInsideMarkdownCodeFence,
	updateMarkdownFenceTracker,
} from "./markdownFence";

const HTML_EMBED_BLOCK_TAG_NAMES = ["div", "svg", "script", "style"] as const;
type HtmlEmbedBlockTagName = (typeof HTML_EMBED_BLOCK_TAG_NAMES)[number];

const HTML_EMBED_BLOCK_OPEN_RE = new RegExp(
	`^<(${HTML_EMBED_BLOCK_TAG_NAMES.join("|")})\\b`,
	"i",
);

function isHtmlEmbedBlockStart(text: string, index: number): boolean {
	const slice = text.slice(index);
	const trimmed = slice.match(/^[\t ]*/)?.[0]?.length ?? 0;
	return HTML_EMBED_BLOCK_OPEN_RE.test(slice.slice(trimmed));
}

function readScriptOrStyleElement(
	text: string,
	start: number,
	tagName: "script" | "style",
): { content: string; end: number } | null {
	const openMatch = text
		.slice(start)
		.match(new RegExp(`^<${tagName}\\b[^>]*>`, "i"));
	if (!openMatch) return null;
	const openEnd = start + openMatch[0].length;
	const closeEnd = findScriptOrStyleClose(text, openEnd, tagName);
	if (closeEnd === null) return null;
	return { content: text.slice(start, closeEnd), end: closeEnd };
}

function findScriptOrStyleClose(
	text: string,
	openEnd: number,
	tagName: "script" | "style",
): number | null {
	const closeTag = `</${tagName}`;
	let index = openEnd;
	let inSingle = false;
	let inDouble = false;
	let inTemplate = false;
	let inLineComment = false;
	let inBlockComment = false;

	while (index < text.length) {
		const char = text[index];
		const next = text[index + 1];

		if (inLineComment) {
			if (char === "\n") inLineComment = false;
			index += 1;
			continue;
		}
		if (inBlockComment) {
			if (char === "*" && next === "/") {
				inBlockComment = false;
				index += 2;
				continue;
			}
			index += 1;
			continue;
		}

		if (!inSingle && !inDouble && !inTemplate) {
			if (char === "/" && next === "/") {
				inLineComment = true;
				index += 2;
				continue;
			}
			if (char === "/" && next === "*") {
				inBlockComment = true;
				index += 2;
				continue;
			}
			if (
				text.slice(index, index + closeTag.length).toLowerCase() === closeTag
			) {
				const afterTag = text.slice(index + closeTag.length).match(/^\s*>/);
				if (afterTag) {
					return index + closeTag.length + afterTag[0].length;
				}
			}
		}

		if (!inDouble && !inTemplate && char === "'" && !inSingle) {
			inSingle = true;
			index += 1;
			continue;
		}
		if (inSingle) {
			if (char === "\\") {
				index += 2;
				continue;
			}
			if (char === "'") inSingle = false;
			index += 1;
			continue;
		}

		if (!inSingle && !inTemplate && char === '"' && !inDouble) {
			inDouble = true;
			index += 1;
			continue;
		}
		if (inDouble) {
			if (char === "\\") {
				index += 2;
				continue;
			}
			if (char === '"') inDouble = false;
			index += 1;
			continue;
		}

		if (!inSingle && !inDouble && char === "`" && !inTemplate) {
			inTemplate = true;
			index += 1;
			continue;
		}
		if (inTemplate) {
			if (char === "\\") {
				index += 2;
				continue;
			}
			if (char === "`") inTemplate = false;
			index += 1;
			continue;
		}

		index += 1;
	}

	return null;
}

function readBalancedElement(
	text: string,
	start: number,
	tagName: HtmlEmbedBlockTagName,
): { content: string; end: number } | null {
	if (tagName === "script" || tagName === "style") {
		return readScriptOrStyleElement(text, start, tagName);
	}

	const openMatch = text
		.slice(start)
		.match(new RegExp(`^<${tagName}\\b[^>]*>`, "i"));
	if (!openMatch) return null;
	const openEnd = start + openMatch[0].length;
	const openTagRe = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
	const closeTagRe = new RegExp(`</${tagName}\\s*>`, "gi");
	let depth = 1;
	let cursor = openEnd;

	while (depth > 0 && cursor < text.length) {
		openTagRe.lastIndex = cursor;
		closeTagRe.lastIndex = cursor;
		const nextOpen = openTagRe.exec(text);
		const nextClose = closeTagRe.exec(text);
		if (!nextClose) return null;
		if (nextOpen && nextOpen.index < nextClose.index) {
			depth += 1;
			cursor = nextOpen.index + nextOpen[0].length;
			continue;
		}
		depth -= 1;
		if (depth === 0) {
			const end = nextClose.index + nextClose[0].length;
			return { content: text.slice(start, end), end };
		}
		cursor = nextClose.index + nextClose[0].length;
	}

	return null;
}

function readHtmlEmbedBlockElement(
	text: string,
	start: number,
): { content: string; end: number; tagName: HtmlEmbedBlockTagName } | null {
	const leading = text.slice(start).match(/^[\t ]*/)?.[0]?.length ?? 0;
	const tagStart = start + leading;
	const tagMatch = text.slice(tagStart).match(HTML_EMBED_BLOCK_OPEN_RE);
	if (!tagMatch) return null;
	const tagName = tagMatch[1].toLowerCase() as HtmlEmbedBlockTagName;
	const parsed = readBalancedElement(text, tagStart, tagName);
	if (!parsed) return null;
	return { ...parsed, tagName };
}

function skipOptionalBlankLines(text: string, index: number): number {
	let cursor = index;
	while (cursor < text.length) {
		const lineEnd = text.indexOf("\n", cursor);
		const line = text.slice(cursor, lineEnd === -1 ? undefined : lineEnd);
		if (line.trim() !== "") break;
		cursor = lineEnd === -1 ? text.length : lineEnd + 1;
	}
	return cursor;
}

function findRawHtmlEmbedRuns(input: string) {
	const runs: Array<{
		start: number;
		end: number;
		kind: HtmlEmbedKind;
		content: string;
	}> = [];
	let cursor = 0;

	while (cursor < input.length) {
		if (!isHtmlEmbedBlockStart(input, cursor)) {
			const nextLine = input.indexOf("\n", cursor);
			cursor = nextLine === -1 ? input.length : nextLine + 1;
			continue;
		}

		const runStart = cursor;
		const parts: string[] = [];
		let firstTag: HtmlEmbedBlockTagName | null = null;

		while (cursor < input.length) {
			cursor = skipOptionalBlankLines(input, cursor);
			if (!isHtmlEmbedBlockStart(input, cursor)) break;

			const block = readHtmlEmbedBlockElement(input, cursor);
			if (!block) {
				if (!parts.length) {
					const nextLine = input.indexOf("\n", cursor);
					cursor = nextLine === -1 ? input.length : nextLine + 1;
				}
				break;
			}
			if (!firstTag) firstTag = block.tagName;
			parts.push(block.content);
			cursor = skipOptionalBlankLines(input, block.end);
		}

		if (!parts.length || firstTag === null) continue;
		const kind =
			firstTag === "svg" && parts.every((part) => /^<svg\b/i.test(part.trim()))
				? "svg"
				: "html";
		runs.push({
			start: runStart,
			end: cursor,
			kind,
			content: parts.join("\n"),
		});
	}

	return runs;
}

function preprocessRawHtmlEmbedChunk(input: string): string {
	const runs = findRawHtmlEmbedRuns(input);
	if (!runs.length) return input;

	let result = input;
	for (let index = runs.length - 1; index >= 0; index -= 1) {
		const run = runs[index];
		const replacement = rawHtmlToFencedBlock(run.kind, run.content);
		result = result.slice(0, run.start) + replacement + result.slice(run.end);
	}
	return result;
}

export function preprocessRawHtmlEmbeds(markdown: string): string {
	if (
		!/<(div|svg|script|style)\b/i.test(markdown) &&
		!markdown.includes(HTML_EMBED_RAW_SENTINEL)
	) {
		return markdown;
	}

	const lines = markdown.split("\n");
	const output: string[] = [];
	let chunk: string[] = [];
	const fenceTracker = createMarkdownFenceTracker();

	for (const line of lines) {
		if (updateMarkdownFenceTracker(line, fenceTracker)) {
			if (chunk.length) {
				output.push(preprocessRawHtmlEmbedChunk(chunk.join("\n")));
				chunk = [];
			}
			output.push(line);
			continue;
		}
		if (isInsideMarkdownCodeFence(fenceTracker)) {
			output.push(line);
			continue;
		}
		chunk.push(line);
	}

	if (chunk.length) output.push(preprocessRawHtmlEmbedChunk(chunk.join("\n")));
	return output.join("\n");
}
