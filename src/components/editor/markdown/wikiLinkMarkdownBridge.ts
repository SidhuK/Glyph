import {
	EDITOR_TEXT_COLOR_BRIDGE_CLOSE_TOKEN,
	getEditorTextColorBridgeOpenToken,
	getEditorTextColorMarkdownOpenTag,
	isEditorTextColor,
} from "../textColors";
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

const GLYPH_COLOR_HTML_RE =
	/<span\b(?=[^>]*\bdata-glyph-color=(?:"([^"]+)"|'([^']+)'))(?=[^>]*\bstyle=(?:"[^"]*"|'[^']*'))[^>]*>([\s\S]*?)<\/span>/gi;

const GLYPH_COLOR_BRIDGE_RE =
	/\{\{glyph-color:([a-z]+)\}\}([\s\S]*?)\{\{\/glyph-color\}\}/gi;

function preprocessColoredText(input: string): string {
	return input.replace(
		GLYPH_COLOR_HTML_RE,
		(
			_match,
			dqColor: string | undefined,
			sqColor: string | undefined,
			text: string,
		) => {
			const color = (dqColor ?? sqColor ?? "").trim().toLowerCase();
			if (!isEditorTextColor(color)) return text;
			return `${getEditorTextColorBridgeOpenToken(color)}${text}${EDITOR_TEXT_COLOR_BRIDGE_CLOSE_TOKEN}`;
		},
	);
}

function postprocessColoredText(input: string): string {
	return input.replace(
		GLYPH_COLOR_BRIDGE_RE,
		(_match, rawColor: string, text: string) => {
			if (!isEditorTextColor(rawColor)) return text;
			return `${getEditorTextColorMarkdownOpenTag(rawColor)}${text}</span>`;
		},
	);
}

export function preprocessMarkdownForEditor(markdown: string): string {
	return preprocessColoredText(canonicalizeWikiLinks(markdown));
}

export function postprocessMarkdownFromEditor(markdown: string): string {
	return postprocessColoredText(canonicalizeWikiLinks(markdown));
}
