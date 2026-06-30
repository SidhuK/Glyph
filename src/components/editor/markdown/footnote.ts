// Matches a footnote token such as `[^1]` or `[^note]`. The id may not contain
// whitespace or closing brackets.
export const FOOTNOTE_PATTERN = /\[\^([^\]\s]+)\]/g;

export type FootnoteKind = "ref" | "def";

export function isFootnoteDefinition(
	text: string,
	matchIndex: number,
	matchLength: number,
): boolean {
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
