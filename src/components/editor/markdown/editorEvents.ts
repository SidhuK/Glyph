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
}

export interface TagClickDetail {
	tag: string;
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
