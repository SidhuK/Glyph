import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";

export const GlyphDetails = Details.configure({
	persist: true,
	openClassName: "is-open",
	HTMLAttributes: {
		class: "detailsBlock",
	},
});

export const GlyphDetailsSummary = DetailsSummary.configure({
	HTMLAttributes: {
		class: "detailsSummary",
	},
});

export const GlyphDetailsContent = DetailsContent.configure({
	HTMLAttributes: {
		class: "detailsContent",
	},
});

export const glyphDetailsExtensions = [GlyphDetails, GlyphDetailsSummary, GlyphDetailsContent];
