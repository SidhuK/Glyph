export type WikiLinkAnchorKind = "none" | "heading" | "block";

export interface WikiLinkAttrs {
	raw: string;
	target: string;
	alias: string | null;
	anchorKind: WikiLinkAnchorKind;
	anchor: string | null;
	unresolved: boolean;
}
