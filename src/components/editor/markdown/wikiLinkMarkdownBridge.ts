import {
	EDITOR_TEXT_COLOR_BRIDGE_CLOSE_TOKEN,
	getEditorTextColorBridgeOpenToken,
	getEditorTextColorMarkdownOpenTag,
	isEditorTextColor,
} from "../textColors";
import {
	EDITOR_TEXT_HIGHLIGHT_BRIDGE_CLOSE_TOKEN,
	getEditorTextHighlightBridgeOpenToken,
	getEditorTextHighlightMarkdownOpenTag,
	isEditorTextHighlight,
} from "../textHighlights";
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

const MARKDOWN_IMAGE_WITHOUT_TITLE_RE =
	/!\[([^\]\n]*)\]\(([^)\n"]*\s[^)\n"]*)\)/g;

function encodeMarkdownImageDestinations(input: string): string {
	return input.replace(
		MARKDOWN_IMAGE_WITHOUT_TITLE_RE,
		(match, alt: string, rawHref: string) => {
			const href = typeof rawHref === "string" ? rawHref.trim() : "";
			if (!href) return match;
			try {
				return `![${alt}](${encodeURI(decodeURI(href))})`;
			} catch {
				return `![${alt}](${encodeURI(href)})`;
			}
		},
	);
}

const GLYPH_COLOR_HTML_RE =
	/<span\b(?=[^>]*\bdata-glyph-color=(?:"([^"]+)"|'([^']+)'))(?=[^>]*\bstyle=(?:"[^"]*"|'[^']*'))[^>]*>([\s\S]*?)<\/span>/gi;

const GLYPH_COLOR_BRIDGE_RE =
	/\{\{glyph-color:([a-z]+)\}\}([\s\S]*?)\{\{\/glyph-color\}\}/gi;
const GLYPH_HIGHLIGHT_HTML_RE =
	/<mark\b(?=[^>]*\bdata-glyph-highlight=(?:"([^"]+)"|'([^']+)'))(?=[^>]*\bstyle=(?:"[^"]*"|'[^']*'))[^>]*>([\s\S]*?)<\/mark>/gi;
const GLYPH_HIGHLIGHT_BRIDGE_RE =
	/\{\{glyph-highlight:([a-z]+)\}\}([\s\S]*?)\{\{\/glyph-highlight\}\}/gi;

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

function preprocessHighlightedText(input: string): string {
	return input.replace(
		GLYPH_HIGHLIGHT_HTML_RE,
		(
			_match,
			dqColor: string | undefined,
			sqColor: string | undefined,
			text: string,
		) => {
			const color = (dqColor ?? sqColor ?? "").trim().toLowerCase();
			if (!isEditorTextHighlight(color)) return text;
			return `${getEditorTextHighlightBridgeOpenToken(color)}${text}${EDITOR_TEXT_HIGHLIGHT_BRIDGE_CLOSE_TOKEN}`;
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

function postprocessHighlightedText(input: string): string {
	return input.replace(
		GLYPH_HIGHLIGHT_BRIDGE_RE,
		(_match, rawColor: string, text: string) => {
			if (!isEditorTextHighlight(rawColor)) return text;
			return `${getEditorTextHighlightMarkdownOpenTag(rawColor)}${text}</mark>`;
		},
	);
}

export function preprocessMarkdownForEditor(markdown: string): string {
	return preprocessColoredText(
		preprocessHighlightedText(
			encodeMarkdownImageDestinations(canonicalizeWikiLinks(markdown)),
		),
	);
}

export function postprocessMarkdownFromEditor(markdown: string): string {
	return postprocessHighlightedText(
		postprocessColoredText(canonicalizeWikiLinks(markdown)),
	);
}
