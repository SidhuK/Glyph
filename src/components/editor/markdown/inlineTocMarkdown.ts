import {
	createMarkdownFenceTracker,
	isInsideMarkdownCodeFence,
	updateMarkdownFenceTracker,
} from "./markdownFence";

export const INLINE_TOC_MARKDOWN_MARKER = "<!-- glyph:toc -->";
export const INLINE_TOC_EDITOR_MARKER = "{{glyph:toc}}";

function replaceMarkerLines(
	input: string,
	fromMarker: string,
	toMarker: string,
) {
	const normalizedFromMarker = fromMarker.toLowerCase();
	const lines = input.split("\n");
	const fenceTracker = createMarkdownFenceTracker();
	return lines
		.map((line) => {
			updateMarkdownFenceTracker(line, fenceTracker);
			if (
				isInsideMarkdownCodeFence(fenceTracker) ||
				line.trim().toLowerCase() !== normalizedFromMarker
			) {
				return line;
			}
			const leadingWhitespace = line.match(/^\s*/)?.[0] ?? "";
			return `${leadingWhitespace}${toMarker}`;
		})
		.join("\n");
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
