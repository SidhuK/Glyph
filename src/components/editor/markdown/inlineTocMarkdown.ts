export const INLINE_TOC_MARKDOWN_MARKER = "<!-- glyph:toc -->";
export const INLINE_TOC_EDITOR_MARKER = "{{glyph:toc}}";

function isMarkdownCodeFenceToggle(line: string): boolean {
	return /^(`{3,}|~{3,})/.test(line.trim());
}

function replaceMarkerLines(
	input: string,
	fromMarker: string,
	toMarker: string,
) {
	const normalizedFromMarker = fromMarker.toLowerCase();
	const lines = input.split("\n");
	let inCodeFence = false;
	return lines
		.map((line) => {
			if (isMarkdownCodeFenceToggle(line)) {
				inCodeFence = !inCodeFence;
				return line;
			}
			if (inCodeFence || line.trim().toLowerCase() !== normalizedFromMarker) {
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
