export const WIKI_LINK_CLICK_EVENT = "glyph:wikilink-click";
export const MARKDOWN_LINK_CLICK_EVENT = "glyph:markdown-link-click";
export const TAG_CLICK_EVENT = "glyph:tag-click";
export const PERSON_CLICK_EVENT = "glyph:person-click";
export const INTERNAL_ANCHOR_CLICK_EVENT = "glyph:internal-anchor-click";

export interface WikiLinkClickDetail {
	raw: string;
	target: string;
	alias: string | null;
	anchorKind: "none" | "heading" | "block";
	anchor: string | null;
	unresolved: boolean;
	embed?: boolean;
	sourcePath?: string;
}

export interface TagClickDetail {
	tag: string;
	tagOnly?: boolean;
}

export interface PersonClickDetail {
	handle: string;
}

export interface MarkdownLinkClickDetail {
	href: string;
	sourcePath: string;
}

export interface InternalAnchorClickDetail {
	anchor: string;
	sourcePath: string;
}

function isInternalAnchorClickDetail(
	value: unknown,
): value is InternalAnchorClickDetail {
	if (typeof value !== "object" || value === null) return false;
	if (!("anchor" in value) || !("sourcePath" in value)) return false;
	return (
		typeof value.anchor === "string" && typeof value.sourcePath === "string"
	);
}

export function isInternalAnchorClickEvent(
	event: Event,
): event is CustomEvent<InternalAnchorClickDetail> {
	return (
		event.type === INTERNAL_ANCHOR_CLICK_EVENT &&
		event instanceof CustomEvent &&
		isInternalAnchorClickDetail(event.detail)
	);
}

function isWikiLinkClickDetail(value: unknown): value is WikiLinkClickDetail {
	if (typeof value !== "object" || value === null) return false;
	if (!("target" in value) || typeof value.target !== "string") return false;
	if (!("raw" in value) || typeof value.raw !== "string") return false;
	if (!("unresolved" in value) || typeof value.unresolved !== "boolean") {
		return false;
	}
	if (
		!("alias" in value) ||
		(value.alias !== null && typeof value.alias !== "string")
	) {
		return false;
	}
	if (!("anchorKind" in value)) return false;
	const kind = value.anchorKind;
	if (kind !== "none" && kind !== "heading" && kind !== "block") return false;
	if (
		!("anchor" in value) ||
		(value.anchor !== null && typeof value.anchor !== "string")
	) {
		return false;
	}
	if ("embed" in value && typeof value.embed !== "boolean") return false;
	if ("sourcePath" in value && typeof value.sourcePath !== "string") {
		return false;
	}
	return true;
}

export function isWikiLinkClickEvent(
	event: Event,
): event is CustomEvent<WikiLinkClickDetail> {
	return (
		event.type === WIKI_LINK_CLICK_EVENT &&
		event instanceof CustomEvent &&
		isWikiLinkClickDetail(event.detail)
	);
}

export function dispatchWikiLinkClick(detail: WikiLinkClickDetail): void {
	window.dispatchEvent(
		new CustomEvent<WikiLinkClickDetail>(WIKI_LINK_CLICK_EVENT, { detail }),
	);
}

export function dispatchTagClick(detail: TagClickDetail): void {
	window.dispatchEvent(
		new CustomEvent<TagClickDetail>(TAG_CLICK_EVENT, { detail }),
	);
}

export function dispatchPersonClick(detail: PersonClickDetail): void {
	window.dispatchEvent(
		new CustomEvent<PersonClickDetail>(PERSON_CLICK_EVENT, { detail }),
	);
}

export function dispatchMarkdownLinkClick(
	detail: MarkdownLinkClickDetail,
): void {
	window.dispatchEvent(
		new CustomEvent<MarkdownLinkClickDetail>(MARKDOWN_LINK_CLICK_EVENT, {
			detail,
		}),
	);
}

export function dispatchInternalAnchorClick(
	detail: InternalAnchorClickDetail,
): void {
	window.dispatchEvent(
		new CustomEvent<InternalAnchorClickDetail>(INTERNAL_ANCHOR_CLICK_EVENT, {
			detail,
		}),
	);
}
