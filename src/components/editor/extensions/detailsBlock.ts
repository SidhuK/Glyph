import {
	Details,
	DetailsContent,
	DetailsSummary,
} from "@tiptap/extension-details";

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

export const glyphDetailsExtensions = [
	GlyphDetails,
	GlyphDetailsSummary,
	GlyphDetailsContent,
];

export function createDetailsBlockContent(summary = "Toggle title") {
	return {
		type: "details",
		attrs: { open: true },
		content: [
			{
				type: "detailsSummary",
				content: summary ? [{ type: "text", text: summary }] : undefined,
			},
			{
				type: "detailsContent",
				content: [{ type: "paragraph" }],
			},
		],
	};
}
