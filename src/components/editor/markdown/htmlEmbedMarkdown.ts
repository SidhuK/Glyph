import {
	HTML_EMBED_RAW_SENTINEL,
	postprocessHtmlEmbedFences,
} from "../../../lib/htmlEmbed";
import { preprocessRawHtmlEmbeds } from "./rawHtmlEmbedBridge";

export {
	HTML_EMBED_RAW_SENTINEL,
	stripHtmlEmbedRawSentinel,
	wrapHtmlEmbedBody,
} from "../../../lib/htmlEmbed";

export function preprocessHtmlEmbeds(markdown: string): string {
	return preprocessRawHtmlEmbeds(markdown);
}

export function postprocessHtmlEmbeds(markdown: string): string {
	if (
		!markdown.includes("```html") &&
		!markdown.includes("```svg") &&
		!markdown.includes(HTML_EMBED_RAW_SENTINEL)
	) {
		return markdown;
	}
	return postprocessHtmlEmbedFences(markdown);
}
