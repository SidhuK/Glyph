import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import {
	detailsMarkdownTokenizer,
	parseDetailsMarkdown,
	renderDetailsMarkdown,
} from "../markdown/detailsMarkdown";

// Reads and writes `<details>` HTML directly instead of TipTap's `:::details` syntax.
export const GlyphDetails = Details.extend({
	markdownTokenizer: detailsMarkdownTokenizer,
	parseMarkdown: parseDetailsMarkdown,
	renderMarkdown: renderDetailsMarkdown,
}).configure({
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
