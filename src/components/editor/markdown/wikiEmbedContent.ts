import DOMPurify from "dompurify";
import { Marked, type Token, type Tokens } from "marked";
import { splitYamlFrontmatter } from "../../../lib/notePreview";
import { analyzeNoteInfo } from "../../preview/noteInfoAnalysis";
import { resolveAnchorHeading } from "./headingAnchor";
import type { WikiLinkAttrs } from "./wikiLinkTypes";

// Block ID markers render as nothing; inline tokenizers never run inside code.
const markdown = new Marked({
	extensions: [
		{
			name: "blockId",
			level: "inline",
			start: (src) => src.match(/(?:^|[ \t])\^[A-Za-z0-9-]+[ \t]*$/m)?.index,
			tokenizer: (src) => {
				const match = /^[ \t]*\^[A-Za-z0-9-]+[ \t]*(?=\n|$)/.exec(src);
				return match ? { type: "blockId", raw: match[0] } : undefined;
			},
			renderer: () => "",
		},
	],
});

// Uses the same heading scan and slugs as the `#` suggestions, so a suggested anchor
// always selects the heading it was suggested for.
function headingSection(body: string, anchor: string): string | null {
	const { headings } = analyzeNoteInfo(body, body, { includeHeadings: true, includeStats: false });
	const start = resolveAnchorHeading(headings, anchor);
	if (!start) return null;
	const end = headings.find((heading) => heading.pos > start.pos && heading.level <= start.level);
	return body.slice(start.pos, end?.pos);
}

function findMarked(tokens: Token[], marker: RegExp): string | null {
	for (const token of tokens) {
		if (token.type === "list") {
			const found = findMarked(
				token.items.flatMap((item: Tokens.ListItem) => item.tokens),
				marker,
			);
			if (found) return found;
		} else if (token.type !== "code" && marker.test(token.raw.trimEnd())) {
			return token.raw;
		}
	}
	return null;
}

// `^id` ends the block it marks, or sits alone on the line after it (tables, quotes).
function markedBlock(body: string, id: string): string | null {
	if (!/^[A-Za-z0-9-]+$/.test(id)) return null;
	const blocks = markdown.lexer(body).filter((token) => token.type !== "space");
	const standalone = blocks.findIndex((block) => block.raw.trim() === `^${id}`);
	if (standalone >= 0) return blocks[standalone - 1]?.raw ?? null;
	return findMarked(blocks, new RegExp(`(?:^|\\s)\\^${id}$`));
}

export function wikiEmbedContent(text: string, attrs: WikiLinkAttrs): string | null {
	const { body } = splitYamlFrontmatter(text);
	let passage: string | null = body;
	if (attrs.anchorKind === "heading" && attrs.anchor) passage = headingSection(body, attrs.anchor);
	if (attrs.anchorKind === "block" && attrs.anchor) passage = markedBlock(body, attrs.anchor);
	if (passage === null) return null;
	// Render a finite snapshot: nested wiki embeds stay literal and links flatten to text.
	return DOMPurify.sanitize(markdown.parse(passage, { async: false }), {
		USE_PROFILES: { html: true },
		FORBID_TAGS: ["a", "img", "iframe", "video", "audio", "style", "input", "button", "textarea"],
		FORBID_ATTR: ["style", "id", "contenteditable"],
	});
}
