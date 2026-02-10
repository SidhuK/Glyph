export const WIKI_LINK_CLICK_EVENT = "lattice:wikilink-click";

export interface WikiLinkClickDetail {
	raw: string;
	target: string;
	alias: string | null;
	anchorKind: "none" | "heading" | "block";
	anchor: string | null;
	unresolved: boolean;
}

export function dispatchWikiLinkClick(detail: WikiLinkClickDetail): void {
	window.dispatchEvent(
		new CustomEvent<WikiLinkClickDetail>(WIKI_LINK_CLICK_EVENT, { detail }),
	);
}
