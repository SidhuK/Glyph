const HEADING_RE = /^\s{0,3}#{1,6}\s+\S/m;
const BULLET_LIST_RE = /^\s{0,3}[-+*]\s+\S/m;
const ORDERED_LIST_RE = /^\s{0,3}\d+[.)]\s+\S/m;
const TASK_LIST_RE = /^\s{0,3}[-+*]\s+\[[ xX]\]\s+\S/m;
const BLOCKQUOTE_RE = /^\s{0,3}>\s*\S/m;
const FENCED_CODE_BLOCK_RE =
	/(^|\n)\s*(```|~~~)[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/m;
const MARKDOWN_LINK_RE = /!?\[[^\]\n]+\]\([^)]+\)/;
const WIKI_LINK_RE = /\[\[[^[\]\n]+]]/;
const INLINE_CODE_RE = /(^|[\s([{>])`[^`\n]+`(?=$|[\s)\]},.!?:;])/m;
const EMPHASIS_RE =
	/(^|[\s([{>])(?:\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)(?=$|[\s)\]},.!?:;])/m;

function hasMarkdownTable(input: string): boolean {
	const lines = input.split("\n");
	for (let index = 0; index < lines.length - 1; index += 1) {
		const header = lines[index]?.trim() ?? "";
		const divider = lines[index + 1]?.trim() ?? "";
		if (!header.includes("|")) continue;
		if (/^\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?$/.test(divider)) {
			return true;
		}
	}
	return false;
}

export function looksLikeMarkdownPaste(input: string): boolean {
	const normalized = input.replace(/\r\n?/g, "\n").trim();
	if (!normalized) return false;

	return (
		HEADING_RE.test(normalized) ||
		BULLET_LIST_RE.test(normalized) ||
		ORDERED_LIST_RE.test(normalized) ||
		TASK_LIST_RE.test(normalized) ||
		BLOCKQUOTE_RE.test(normalized) ||
		FENCED_CODE_BLOCK_RE.test(normalized) ||
		hasMarkdownTable(normalized) ||
		MARKDOWN_LINK_RE.test(normalized) ||
		WIKI_LINK_RE.test(normalized) ||
		INLINE_CODE_RE.test(normalized) ||
		EMPHASIS_RE.test(normalized)
	);
}
