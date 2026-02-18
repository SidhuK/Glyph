export const WIKI_LINK_CLICK_EVENT = "glyph:wikilink-click";
export const MARKDOWN_LINK_CLICK_EVENT = "glyph:markdown-link-click";
export const TAG_CLICK_EVENT = "glyph:tag-click";

export interface WikiLinkClickDetail {
	raw: string;
	target: string;
	alias: string | null;
	anchorKind: "none" | "heading" | "block";
	anchor: string | null;
	unresolved: boolean;
}

export interface TagClickDetail {
	tag: string;
}

export interface MarkdownLinkClickDetail {
	href: string;
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

export function dispatchMarkdownLinkClick(
	detail: MarkdownLinkClickDetail,
): void {
	window.dispatchEvent(
		new CustomEvent<MarkdownLinkClickDetail>(MARKDOWN_LINK_CLICK_EVENT, {
			detail,
		}),
	);
}
