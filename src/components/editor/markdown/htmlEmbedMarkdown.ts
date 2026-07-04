const HTML_EMBED_RAW_SENTINEL = "<!--glyph-raw-html-embed-->";
const HTML_EMBED_BLOCK_TAG_NAMES = ["div", "svg", "script", "style"] as const;
type HtmlEmbedBlockTagName = (typeof HTML_EMBED_BLOCK_TAG_NAMES)[number];

const HTML_EMBED_BLOCK_OPEN_RE = new RegExp(
	`^<(${HTML_EMBED_BLOCK_TAG_NAMES.join("|")})\\b`,
	"i",
);

function isMarkdownCodeFenceToggle(line: string): boolean {
	return /^(`{3,}|~{3,})/.test(line.trim());
}

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
	const closeMatch = text
		.slice(openEnd)
		.match(new RegExp(`</${tagName}\\s*>`, "i"));
	if (!closeMatch || closeMatch.index === undefined) return null;
	const end = openEnd + closeMatch.index + closeMatch[0].length;
	return { content: text.slice(start, end), end };
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
		kind: "html" | "svg";
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
			if (!block) break;
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

function rawHtmlToFencedBlock(kind: "html" | "svg", content: string): string {
	return [`\`\`\`${kind}`, HTML_EMBED_RAW_SENTINEL, content, "```"].join("\n");
}

function preprocessHtmlEmbedChunk(input: string): string {
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

const FENCED_HTML_EMBED_OPEN_RE = /^(`{3,}|~{3,})(html|svg)\s*$/i;

function postprocessHtmlEmbedFences(input: string): string {
	const lines = input.split("\n");
	const output: string[] = [];
	let index = 0;
	let inCodeFence = false;
	let fenceMarker: string | null = null;
	let fenceKind: "html" | "svg" | null = null;
	let fenceContent: string[] = [];

	const flushFence = () => {
		if (!fenceMarker || !fenceKind) {
			output.push(...fenceContent);
			return;
		}
		const content = fenceContent.join("\n");
		const sentinelPrefix = `${HTML_EMBED_RAW_SENTINEL}\n`;
		if (content.startsWith(sentinelPrefix)) {
			output.push(content.slice(sentinelPrefix.length));
		} else {
			output.push(fenceMarker + fenceKind);
			for (const line of fenceContent) output.push(line);
			output.push(fenceMarker);
		}
		fenceMarker = null;
		fenceKind = null;
		fenceContent = [];
	};

	while (index < lines.length) {
		const line = lines[index] ?? "";

		if (!inCodeFence) {
			const openMatch = line.match(FENCED_HTML_EMBED_OPEN_RE);
			if (openMatch) {
				inCodeFence = true;
				fenceMarker = openMatch[1];
				fenceKind = openMatch[2].toLowerCase() as "html" | "svg";
				fenceContent = [];
				index += 1;
				continue;
			}
			output.push(line);
			index += 1;
			continue;
		}

		const closeMatch = fenceMarker
			? new RegExp(
					`^${fenceMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
				).test(line)
			: false;
		if (closeMatch) {
			flushFence();
			inCodeFence = false;
			index += 1;
			continue;
		}

		fenceContent.push(line);
		index += 1;
	}

	if (inCodeFence) {
		output.push(fenceMarker + (fenceKind ?? ""));
		output.push(...fenceContent);
	}

	return output.join("\n");
}

export function wrapHtmlEmbedBody(
	source: string,
	kind: "html" | "svg",
): string {
	return kind === "svg" ? `<main>${source}</main>` : source;
}

export function stripHtmlEmbedRawSentinel(source: string): string {
	if (!source.startsWith(HTML_EMBED_RAW_SENTINEL)) return source;
	return source.slice(HTML_EMBED_RAW_SENTINEL.length).replace(/^\n/, "");
}

export function preprocessHtmlEmbeds(markdown: string): string {
	if (
		!/<(div|svg|script|style)\b/i.test(markdown) &&
		!markdown.includes(HTML_EMBED_RAW_SENTINEL)
	) {
		return markdown;
	}

	const lines = markdown.split("\n");
	const output: string[] = [];
	let chunk: string[] = [];
	let inCodeFence = false;

	for (const line of lines) {
		if (isMarkdownCodeFenceToggle(line)) {
			if (chunk.length) {
				output.push(preprocessHtmlEmbedChunk(chunk.join("\n")));
				chunk = [];
			}
			inCodeFence = !inCodeFence;
			output.push(line);
			continue;
		}
		if (inCodeFence) {
			output.push(line);
			continue;
		}
		chunk.push(line);
	}

	if (chunk.length) output.push(preprocessHtmlEmbedChunk(chunk.join("\n")));
	return output.join("\n");
}

export function postprocessHtmlEmbeds(markdown: string): string {
	if (
		!markdown.includes("```html") &&
		!markdown.includes("```svg") &&
		!markdown.includes(HTML_EMBED_RAW_SENTINEL)
	) {
		return markdown;
	}
	return postprocessHtmlEmbedFences(markdown);
}
