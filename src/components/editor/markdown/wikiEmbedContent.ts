import DOMPurify from "dompurify";
import { Marked, type Token } from "marked";
import { splitYamlFrontmatter } from "../../../lib/notePreview";
import { resolveAnchorHeading } from "./headingAnchor";
import type { WikiLinkAttrs } from "./wikiLinkTypes";

const markdown = new Marked();
const BLOCK_ID_MARKERS = /(?:^|[ \t]+)\^[A-Za-z0-9-]+[ \t]*$/gm;

// A heading section runs until the next heading of equal or higher level.
function headingSection(tokens: Token[], anchor: string): string | null {
	const headings = tokens.flatMap((token, pos) =>
		token.type === "heading"
			? [{ id: String(pos), pos, level: token.depth, text: token.text }]
			: [],
	);
	const start = resolveAnchorHeading(headings, anchor);
	if (!start) return null;
	const end = headings.find((heading) => heading.pos > start.pos && heading.level <= start.level);
	return tokens
		.slice(start.pos, end?.pos)
		.map((token) => token.raw)
		.join("");
}

// `^id` ends the block it marks, or sits alone on the line after it (tables, quotes).
function markedBlock(tokens: Token[], id: string): string | null {
	if (!/^[A-Za-z0-9-]+$/.test(id)) return null;
	const marker = new RegExp(`(?:^|\\s)\\^${id}$`);
	const blocks: Token[] = [];
	for (const token of tokens) {
		if (token.type === "list") blocks.push(...token.items);
		else if (token.type !== "space") blocks.push(token);
	}
	for (const [index, block] of blocks.entries()) {
		const raw = block.raw.trimEnd();
		if (raw === `^${id}`) return blocks[index - 1]?.raw ?? null;
		if (block.type !== "code" && marker.test(raw)) return raw;
	}
	return null;
}

export function wikiEmbedContent(text: string, attrs: WikiLinkAttrs): string | null {
	const { body } = splitYamlFrontmatter(text);
	let passage: string | null = body;
	if (attrs.anchorKind !== "none" && attrs.anchor) {
		const tokens = markdown.lexer(body);
		passage =
			attrs.anchorKind === "heading"
				? headingSection(tokens, attrs.anchor)
				: markedBlock(tokens, attrs.anchor);
	}
	if (passage === null) return null;
	// Render a finite snapshot: nested wiki embeds stay literal and links flatten to text.
	const html = markdown.parse(passage.replace(BLOCK_ID_MARKERS, ""), { async: false });
	return DOMPurify.sanitize(html, {
		USE_PROFILES: { html: true },
		FORBID_TAGS: ["a", "img", "iframe", "video", "audio", "style", "input", "button", "textarea"],
		FORBID_ATTR: ["style", "id", "contenteditable"],
	});
}
