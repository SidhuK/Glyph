import { syntaxTree } from "@codemirror/language";
import type { Range, Text } from "@codemirror/state";
import { Decoration, type EditorView } from "@codemirror/view";
import { FOOTNOTE_PATTERN, footnoteKindAt } from "../markdown/footnote";
import { parseWikiLink } from "../markdown/wikiLinkCodec";
import { INLINE_TAG_PATTERN } from "../noteProperties/utils";

const WIKI_LINK_PATTERN = /!?\[\[[^\]\n]+\]\]/g;
const HIGHLIGHT_PATTERN = /==([^=\n]+)==/g;
const COMMENT_PATTERN = /%%(?:[^%]|%(?!%))*%%/g;
const BLOCK_ID_PATTERN = /(?:^|\s)(\^[A-Za-z0-9-]+)(?=\s*$)/;
const FRONTMATTER_SCAN_LIMIT = 500;

function isCodePosition(view: EditorView, position: number): boolean {
	let node = syntaxTree(view.state).resolveInner(position, 1);
	while (true) {
		if (
			node.name === "FencedCode" ||
			node.name === "CodeBlock" ||
			node.name === "InlineCode"
		) {
			return true;
		}
		const parent = node.parent;
		if (!parent) return false;
		node = parent;
	}
}

function addPatternDecorations(
	ranges: Range<Decoration>[],
	view: EditorView,
	lineFrom: number,
	text: string,
	pattern: RegExp,
	className: string,
) {
	pattern.lastIndex = 0;
	for (const match of text.matchAll(pattern)) {
		if (match.index === undefined) continue;
		const from = lineFrom + match.index;
		if (isCodePosition(view, from)) continue;
		ranges.push(
			Decoration.mark({ class: className }).range(from, from + match[0].length),
		);
	}
}

export function addGlyphInlineDecorations(
	ranges: Range<Decoration>[],
	view: EditorView,
	lineFrom: number,
	text: string,
) {
	WIKI_LINK_PATTERN.lastIndex = 0;
	for (const match of text.matchAll(WIKI_LINK_PATTERN)) {
		if (match.index === undefined) continue;
		const from = lineFrom + match.index;
		if (isCodePosition(view, from)) continue;
		const parsed = parseWikiLink(match[0]);
		if (!parsed) continue;
		ranges.push(
			Decoration.mark({
				class: "cm-raw-wiki-link",
				attributes: {
					"data-raw-wiki-link": match[0],
					"data-embed": String(parsed.embed),
				},
			}).range(from, from + match[0].length),
		);
	}

	INLINE_TAG_PATTERN.lastIndex = 0;
	for (const match of text.matchAll(INLINE_TAG_PATTERN)) {
		if (match.index === undefined || !match[2]) continue;
		const from = lineFrom + match.index + (match[1]?.length ?? 0);
		if (isCodePosition(view, from)) continue;
		const raw = `#${match[2]}`;
		ranges.push(
			Decoration.mark({
				class: "cm-raw-tag",
				attributes: { "data-raw-tag": raw },
			}).range(from, from + raw.length),
		);
	}

	HIGHLIGHT_PATTERN.lastIndex = 0;
	for (const match of text.matchAll(HIGHLIGHT_PATTERN)) {
		if (match.index === undefined || !match[1]) continue;
		const from = lineFrom + match.index;
		if (isCodePosition(view, from)) continue;
		const contentFrom = from + 2;
		ranges.push(
			Decoration.mark({ class: "cm-raw-syntax" }).range(from, contentFrom),
			Decoration.mark({ class: "cm-raw-highlight" }).range(
				contentFrom,
				contentFrom + match[1].length,
			),
			Decoration.mark({ class: "cm-raw-syntax" }).range(
				contentFrom + match[1].length,
				from + match[0].length,
			),
		);
	}
	addPatternDecorations(
		ranges,
		view,
		lineFrom,
		text,
		COMMENT_PATTERN,
		"cm-raw-comment",
	);
	FOOTNOTE_PATTERN.lastIndex = 0;
	for (const match of text.matchAll(FOOTNOTE_PATTERN)) {
		if (match.index === undefined || !match[1]) continue;
		const from = lineFrom + match.index;
		if (isCodePosition(view, from)) continue;
		const kind = footnoteKindAt(text, match.index, match[0].length);
		ranges.push(
			Decoration.mark({
				class: "cm-raw-footnote",
				attributes: {
					"data-footnote-id": match[1],
					"data-footnote-kind": kind,
				},
			}).range(from, from + match[0].length),
		);
	}

	const blockIdMatch = text.match(BLOCK_ID_PATTERN);
	if (blockIdMatch?.[1]) {
		const from = lineFrom + text.lastIndexOf(blockIdMatch[1]);
		if (!isCodePosition(view, from)) {
			ranges.push(
				Decoration.mark({ class: "cm-raw-block-id" }).range(
					from,
					from + blockIdMatch[1].length,
				),
			);
		}
	}
}

export function findFrontmatterEnd(document: Text): number | null {
	if (document.lines < 2 || document.line(1).text.trim() !== "---") return null;
	const lastLine = Math.min(document.lines, FRONTMATTER_SCAN_LIMIT);
	for (let lineNumber = 2; lineNumber <= lastLine; lineNumber += 1) {
		if (document.line(lineNumber).text.trim() === "---") return lineNumber;
	}
	return null;
}
