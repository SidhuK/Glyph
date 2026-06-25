import {
	postprocessEscapedDollars,
	preprocessEscapedDollars,
} from "../extensions/math/mathOptions";
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
	postprocessInlineTocMarkers,
	preprocessInlineTocMarkers,
} from "./inlineTocMarkdown";
import {
	findWikiLinkSpans,
	parseWikiLink,
	wikiLinkAttrsToMarkdown,
} from "./wikiLinkCodec";

const WHITESPACE_LINE_SENTINEL = "\u2060";
const WHITESPACE_SPACE_SENTINEL = "\u2061";
const WHITESPACE_TAB_SENTINEL = "\u2062";
const LEGACY_EXTRA_BLANK_LINE_SENTINEL = "\u200b";

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

function decodeWhitespaceLine(line: string): string | null {
	if (!line.startsWith(WHITESPACE_LINE_SENTINEL)) return null;
	const payload = line.slice(WHITESPACE_LINE_SENTINEL.length);
	if (!payload) return null;

	let decoded = "";
	for (const char of payload) {
		if (char === WHITESPACE_SPACE_SENTINEL) {
			decoded += " ";
			continue;
		}
		if (char === WHITESPACE_TAB_SENTINEL) {
			decoded += "\t";
			continue;
		}
		return null;
	}
	return decoded;
}

function postprocessWhitespaceLines(input: string): string {
	return input
		.split("\n")
		.map((line) => {
			if (line === LEGACY_EXTRA_BLANK_LINE_SENTINEL) return "";
			const decodedWhitespaceLine = decodeWhitespaceLine(line);
			if (decodedWhitespaceLine !== null) return decodedWhitespaceLine;
			return line;
		})
		.join("\n");
}

export function preprocessMarkdownForEditor(markdown: string): string {
	return preprocessEscapedDollars(
		preprocessColoredText(
			preprocessHighlightedText(
				encodeMarkdownImageDestinations(
					canonicalizeWikiLinks(preprocessInlineTocMarkers(markdown)),
				),
			),
		),
	);
}

export function postprocessMarkdownFromEditor(markdown: string): string {
	return postprocessEscapedDollars(
		postprocessInlineTocMarkers(
			postprocessWhitespaceLines(
				postprocessHighlightedText(
					postprocessColoredText(canonicalizeWikiLinks(markdown)),
				),
			),
		),
	);
}
