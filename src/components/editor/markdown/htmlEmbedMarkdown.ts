import {
	HTML_EMBED_RAW_SENTINEL,
	postprocessHtmlEmbedFences,
} from "../../../lib/htmlEmbed";
import { preprocessRawHtmlEmbeds } from "./rawHtmlEmbedBridge";

export function preprocessHtmlEmbeds(markdown: string): string {
	return preprocessRawHtmlEmbeds(markdown);
}

export function postprocessHtmlEmbeds(markdown: string): string {
	// Only sentinel-tagged fences need reversing back to raw HTML.
	if (!markdown.includes(HTML_EMBED_RAW_SENTINEL)) return markdown;
	return postprocessHtmlEmbedFences(markdown);
}
