import DOMPurify from "dompurify";
import { Marked } from "marked";
import { splitYamlFrontmatter } from "../../../lib/notePreview";
import { slugifyHeading } from "./headingAnchor";
import type { WikiLinkAttrs } from "./wikiLinkTypes";

const markdown = new Marked();

export function wikiEmbedContent(text: string, attrs: WikiLinkAttrs): string | null {
	const { body } = splitYamlFrontmatter(text);
	const tokens = attrs.anchorKind === "none" ? [] : markdown.lexer(body);
	let passage = body;
	if (attrs.anchorKind === "heading") {
		const counts = new Map<string, number>();
		let start = -1;
		let level = 0;
		let end = tokens.length;
		const anchor = (attrs.anchor ?? "").trim().toLowerCase();
		for (const [index, token] of tokens.entries()) {
			if (
				token.type !== "heading" ||
				typeof token.depth !== "number" ||
				typeof token.text !== "string"
			) {
				continue;
			}
			if (start >= 0 && token.depth <= level) {
				end = index;
				break;
			}
			const base = slugifyHeading(token.text);
			const count = counts.get(base) ?? 0;
			counts.set(base, count + 1);
			const slug = count ? `${base}-${count}` : base;
			if (start < 0 && (slug === anchor || token.text.toLowerCase() === anchor)) {
				start = index;
				level = token.depth;
			}
		}
		if (start < 0) return null;
		passage = tokens
			.slice(start, end)
			.map((token) => token.raw)
			.join("");
	} else if (attrs.anchorKind === "block") {
		const marker = `^${attrs.anchor ?? ""}`;
		let previous = "";
		let found: string | null = null;
		for (const token of tokens) {
			if (token.type === "space") continue;
			const raw = token.raw.trimEnd();
			if (token.type !== "code" && token.type !== "html") {
				if (raw.trim() === marker && previous) {
					found = previous;
					break;
				}
				if (raw.endsWith(marker) && /\s/.test(raw.charAt(raw.length - marker.length - 1))) {
					found = raw.slice(0, -marker.length).trimEnd();
					break;
				}
			}
			previous = token.raw;
		}
		if (found === null) return null;
		passage = found;
	}
	// Render a finite snapshot: nested wiki embeds remain literal references.
	return DOMPurify.sanitize(markdown.parse(passage, { async: false }), {
		USE_PROFILES: { html: true },
		FORBID_TAGS: ["img", "iframe", "video", "audio", "style", "input", "button"],
		FORBID_ATTR: ["style", "id", "contenteditable"],
	});
}
