import { transformMarkdownOutsideCode } from "./markdownFence";

export const INLINE_TOC_MARKDOWN_MARKER = "<!-- glyph:toc -->";
export const INLINE_TOC_EDITOR_MARKER = "{{glyph:toc}}";

function replaceMarkerLines(
	input: string,
	fromMarker: string,
	toMarker: string,
) {
	const normalizedFromMarker = fromMarker.toLowerCase();
	return transformMarkdownOutsideCode(input, (text) => {
		if (text.trim().toLowerCase() !== normalizedFromMarker) return text;
		const leadingWhitespace = text.match(/^\s*/)?.[0] ?? "";
		return `${leadingWhitespace}${toMarker}`;
	});
}

export function preprocessInlineTocMarkers(markdown: string) {
	return replaceMarkerLines(
		markdown,
		INLINE_TOC_MARKDOWN_MARKER,
		INLINE_TOC_EDITOR_MARKER,
	);
}

export function postprocessInlineTocMarkers(markdown: string) {
	return replaceMarkerLines(
		markdown,
		INLINE_TOC_EDITOR_MARKER,
		INLINE_TOC_MARKDOWN_MARKER,
	);
}
