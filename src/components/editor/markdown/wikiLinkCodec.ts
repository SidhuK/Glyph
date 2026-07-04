import { basename } from "../../../utils/path";
import type { WikiLinkAttrs } from "./wikiLinkTypes";

type WikiLinkAnchorKind = "none" | "heading" | "block";

function findUnescapedIndex(text: string, needle: string): number {
	for (let i = 0; i < text.length; i += 1) {
		if (text[i] !== needle) continue;
		if (i > 0 && text[i - 1] === "\\") continue;
		return i;
	}
	return -1;
}

function hasBalancedBrackets(inner: string): boolean {
	return !inner.includes("[[") && !inner.includes("]]");
}

export function parseWikiLink(raw: string): WikiLinkAttrs | null {
	const embed = raw.startsWith("![[");
	const open = embed ? "![[" : "[[";
	if (!raw.startsWith(open) || !raw.endsWith("]]")) return null;
	const inner = raw.slice(open.length, -2).trim();
	if (!inner || !hasBalancedBrackets(inner)) return null;

	const aliasIdx = findUnescapedIndex(inner, "|");
	const left = aliasIdx >= 0 ? inner.slice(0, aliasIdx).trim() : inner;
	const alias = aliasIdx >= 0 ? inner.slice(aliasIdx + 1).trim() : "";
	if (!left) return null;

	const hashIdx = findUnescapedIndex(left, "#");
	const target = (hashIdx >= 0 ? left.slice(0, hashIdx) : left).trim();
	const anchorRaw = (hashIdx >= 0 ? left.slice(hashIdx + 1) : "").trim();
	if (!target) return null;

	let anchorKind: WikiLinkAnchorKind = "none";
	let anchor: string | null = null;
	if (anchorRaw) {
		if (anchorRaw.startsWith("^")) {
			anchorKind = "block";
			anchor = anchorRaw.slice(1).trim() || null;
		} else {
			anchorKind = "heading";
			anchor = anchorRaw;
		}
		if (!anchor) return null;
	}

	return {
		raw,
		target,
		alias: alias || null,
		embed,
		anchorKind,
		anchor,
		unresolved: false,
	};
}

export function wikiLinkAttrsToMarkdown(attrs: Partial<WikiLinkAttrs>): string {
	const raw = typeof attrs.raw === "string" ? attrs.raw : "";
	const target = typeof attrs.target === "string" ? attrs.target.trim() : "";
	if (!target) return raw || "";

	const alias = typeof attrs.alias === "string" ? attrs.alias.trim() : "";
	const embed = Boolean(attrs.embed);
	const anchorKind = attrs.anchorKind ?? "none";
	const anchor = typeof attrs.anchor === "string" ? attrs.anchor.trim() : "";

	let ref = target;
	if (anchorKind === "heading" && anchor) ref += `#${anchor}`;
	if (anchorKind === "block" && anchor) ref += `#^${anchor}`;
	if ((anchorKind === "heading" || anchorKind === "block") && !anchor) {
		return raw || `[[${target}]]`;
	}

	const base = alias ? `[[${ref}|${alias}]]` : `[[${ref}]]`;
	return embed ? `!${base}` : base;
}

export function findWikiLinkSpans(
	text: string,
): Array<{ start: number; end: number; raw: string }> {
	const spans: Array<{ start: number; end: number; raw: string }> = [];
	const matcher = /!?\[\[[^\]\n]+\]\]/g;
	for (const match of text.matchAll(matcher)) {
		if (match.index === undefined) continue;
		spans.push({
			start: match.index,
			end: match.index + match[0].length,
			raw: match[0],
		});
	}
	return spans;
}

function wikiLinkSpanToMarkdown(raw: string): string {
	const attrs = parseWikiLink(raw);
	if (!attrs) return raw;
	const ref =
		attrs.anchorKind === "heading" && attrs.anchor
			? `${attrs.target}#${attrs.anchor}`
			: attrs.anchorKind === "block" && attrs.anchor
				? `${attrs.target}#^${attrs.anchor}`
				: attrs.target;
	const destination = `<${ref}>`;
	if (attrs.embed) {
		return `![${attrs.alias || basename(attrs.target)}](${destination})`;
	}
	return `[${attrs.alias || attrs.target.replace(/\.(md|markdown)$/i, "")}](${destination})`;
}

export function wikiLinksToStandardMarkdown(markdown: string): string {
	const spans = findWikiLinkSpans(markdown);
	if (spans.length === 0) return markdown;
	let cursor = 0;
	let out = "";
	for (const span of spans) {
		out += markdown.slice(cursor, span.start);
		out += wikiLinkSpanToMarkdown(span.raw);
		cursor = span.end;
	}
	return out + markdown.slice(cursor);
}
