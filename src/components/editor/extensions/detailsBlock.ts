import type { MarkdownTokenizer } from "@tiptap/core";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import {
	detailsMarkdownTokenizer,
	parseDetailsMarkdown,
	renderDetailsContentMarkdown,
	renderDetailsMarkdown,
} from "../markdown/detailsMarkdown";

/** Turns off TipTap's `:::detailsSummary` / `:::detailsContent` syntax, which made stray nodes. */
function inertTokenizer(name: string): MarkdownTokenizer {
	return { name, level: "block", start: () => -1, tokenize: () => undefined };
}

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

export const GlyphDetailsSummary = DetailsSummary.extend({
	markdownTokenizer: inertTokenizer("detailsSummary"),
}).configure({
	HTMLAttributes: {
		class: "detailsSummary",
	},
});

export const GlyphDetailsContent = DetailsContent.extend({
	markdownTokenizer: inertTokenizer("detailsContent"),
	renderMarkdown: renderDetailsContentMarkdown,
}).configure({
	HTMLAttributes: {
		class: "detailsContent",
	},
});

export const glyphDetailsExtensions = [GlyphDetails, GlyphDetailsSummary, GlyphDetailsContent];
