import {
	findWikiLinkSpans,
	parseWikiLink,
	wikiLinkAttrsToMarkdown,
} from "./wikiLinkCodec";

function canonicalizeWikiLinks(input: string): string {
	if (!input.includes("[[")) return input;
	const spans = findWikiLinkSpans(input);
	if (!spans.length) return input;

	let out = "";
	let cursor = 0;
	for (const span of spans) {
		out += input.slice(cursor, span.start);
		const parsed = parseWikiLink(span.raw);
		out += parsed ? wikiLinkAttrsToMarkdown(parsed) : span.raw;
		cursor = span.end;
	}
	out += input.slice(cursor);
	return out;
}

export function preprocessMarkdownForEditor(markdown: string): string {
	return canonicalizeWikiLinks(markdown);
}

export function postprocessMarkdownFromEditor(markdown: string): string {
	return canonicalizeWikiLinks(markdown);
}
