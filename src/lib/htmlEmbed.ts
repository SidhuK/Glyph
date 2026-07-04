export type HtmlEmbedKind = "html" | "svg";

export const HTML_EMBED_RAW_SENTINEL = "<!--glyph-raw-html-embed-->";

const FENCED_HTML_EMBED_RE =
	/(`{3,}|~{3,})(html|svg)[^\S\r\n]*\r?\n([\s\S]*?)\r?\n\1[^\S\r\n]*(?=\r?\n|$)/gi;

export interface HtmlEmbedFenceBlock {
	start: number;
	end: number;
	fence: string;
	kind: HtmlEmbedKind;
	body: string;
}

export function isHtmlEmbedCodeBlockLanguage(
	language: string | null | undefined,
): HtmlEmbedKind | null {
	const normalized = language?.trim().toLowerCase();
	if (normalized === "html") return "html";
	if (normalized === "svg") return "svg";
	return null;
}

export function wrapHtmlEmbedBody(source: string, kind: HtmlEmbedKind): string {
	return kind === "svg" ? `<main>${source}</main>` : source;
}

export function stripHtmlEmbedRawSentinel(source: string): string {
	if (!source.startsWith(HTML_EMBED_RAW_SENTINEL)) return source;
	return source.slice(HTML_EMBED_RAW_SENTINEL.length).replace(/^\n/, "");
}

export function findHtmlEmbedFences(markdown: string): HtmlEmbedFenceBlock[] {
	const blocks: HtmlEmbedFenceBlock[] = [];
	for (const match of markdown.matchAll(FENCED_HTML_EMBED_RE)) {
		if (match.index === undefined) continue;
		blocks.push({
			start: match.index,
			end: match.index + match[0].length,
			fence: match[1],
			kind: match[2].toLowerCase() as HtmlEmbedKind,
			body: match[3],
		});
	}
	return blocks;
}

export function replaceHtmlEmbedFences(
	markdown: string,
	replacer: (block: HtmlEmbedFenceBlock) => string | null,
): string {
	const blocks = findHtmlEmbedFences(markdown);
	if (!blocks.length) return markdown;

	let result = markdown;
	for (let index = blocks.length - 1; index >= 0; index -= 1) {
		const block = blocks[index];
		const replacement = replacer(block);
		if (replacement === null) continue;
		result =
			result.slice(0, block.start) + replacement + result.slice(block.end);
	}
	return result;
}

export function postprocessHtmlEmbedFences(input: string): string {
	const sentinelPrefix = `${HTML_EMBED_RAW_SENTINEL}\n`;

	// Only sentinel-tagged fences (raw HTML converted on ingest) need
	// rewriting; user-authored fences pass through byte-identical.
	return replaceHtmlEmbedFences(input, (block) =>
		block.body.startsWith(sentinelPrefix)
			? block.body.slice(sentinelPrefix.length)
			: null,
	);
}

export function rawHtmlToFencedBlock(
	kind: HtmlEmbedKind,
	content: string,
): string {
	return [`\`\`\`${kind}`, HTML_EMBED_RAW_SENTINEL, content, "```"].join("\n");
}
