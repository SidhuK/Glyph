import {
	createMarkdownFenceTracker,
	findInlineCodeClose,
	isInsideMarkdownCodeFence,
	updateMarkdownFenceTracker,
} from "./markdownFence";

// Matches a footnote token such as `[^1]` or `[^note]`. The id may not contain
// whitespace or closing brackets.
export const FOOTNOTE_PATTERN = /\[\^([^\]\s]+)\]/g;
const UNESCAPED_FOOTNOTE_PATTERN = /(?<!\\)\[\^([^\]\s]+)\]/g;
const PROTECTED_FOOTNOTE_MARKER = "\u2063";
const ESCAPED_FOOTNOTE_PATTERN = /\\\[\^([^\]\s]+)\\\]\u2063/g;

export type FootnoteKind = "ref" | "def";

function isFootnoteDefinition(text: string, matchIndex: number, matchLength: number): boolean {
	const atLineStart = matchIndex === 0 || text[matchIndex - 1] === "\n";
	return atLineStart && text[matchIndex + matchLength] === ":";
}

export function footnoteKindAt(
	text: string,
	matchIndex: number,
	matchLength: number,
): FootnoteKind {
	return isFootnoteDefinition(text, matchIndex, matchLength) ? "def" : "ref";
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the document offset of a footnote ref/def counterpart. Returns the
 * start offset of the matching token, or null when none exists.
 */
export function findFootnoteCounterpartOffset(
	markdown: string,
	id: string,
	fromKind: FootnoteKind,
): number | null {
	const escapedId = escapeRegExp(id);
	if (fromKind === "ref") {
		const definitionPattern = new RegExp(`^\\[\\^${escapedId}\\]:`, "m");
		const match = definitionPattern.exec(markdown);
		return match?.index ?? null;
	}

	const referencePattern = new RegExp(`\\[\\^${escapedId}\\]`, "g");
	for (const match of markdown.matchAll(referencePattern)) {
		const start = match.index ?? 0;
		if (!isFootnoteDefinition(markdown, start, match[0].length)) {
			return start;
		}
	}
	return null;
}

function transformOutsideComments(input: string, transform: (text: string) => string): string {
	let insideComment = false;
	const fence = createMarkdownFenceTracker();
	return input
		.split("\n")
		.map((line) => {
			if (!insideComment) {
				if (/^( {4}|\t)/.test(line)) return line;
				if (updateMarkdownFenceTracker(line, fence) || isInsideMarkdownCodeFence(fence))
					return line;
			}
			let output = "";
			let cursor = 0;
			while (cursor < line.length) {
				if (insideComment) {
					const end = line.indexOf("-->", cursor);
					if (end === -1) return output + line.slice(cursor);
					output += line.slice(cursor, end + 3);
					cursor = end + 3;
					insideComment = false;
					continue;
				}
				const start = line.indexOf("<!--", cursor);
				const tickStart = line.indexOf("`", cursor);
				if (tickStart !== -1 && (start === -1 || tickStart < start)) {
					output += transform(line.slice(cursor, tickStart));
					const ticks = line.slice(tickStart).match(/^`+/)?.[0] ?? "`";
					const close = findInlineCodeClose(line, tickStart, ticks.length);
					if (close === -1) return output + line.slice(tickStart);
					output += line.slice(tickStart, close + ticks.length);
					cursor = close + ticks.length;
					continue;
				}
				if (start === -1) return output + transform(line.slice(cursor));
				output += transform(line.slice(cursor, start));
				insideComment = true;
				cursor = start;
			}
			return output;
		})
		.join("\n");
}

export function protectFootnotes(input: string): string {
	return transformOutsideComments(input, (text) =>
		text.replace(UNESCAPED_FOOTNOTE_PATTERN, String.raw`\[^$1\]${PROTECTED_FOOTNOTE_MARKER}`),
	);
}

export function restoreEscapedFootnotes(input: string): string {
	return transformOutsideComments(input, (text) =>
		text.replace(
			ESCAPED_FOOTNOTE_PATTERN,
			(_match, id: string) => `[^${id.replace(/\\\\/g, "\\")}]`,
		),
	);
}
