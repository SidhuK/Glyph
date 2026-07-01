export const INLINE_TOC_MARKDOWN_MARKER = "<!-- glyph:toc -->";
export const INLINE_TOC_EDITOR_MARKER = "{{glyph:toc}}";

type CodeFenceState = {
	open: boolean;
	marker: string | null;
};

function parseCodeFenceToggle(line: string): string | null {
	const match = line.trim().match(/^(`{3,}|~{3,})/);
	return match?.[1] ?? null;
}

function updateCodeFenceState(
	state: CodeFenceState,
	line: string,
): CodeFenceState {
	const fence = parseCodeFenceToggle(line);
	if (!fence) return state;
	if (!state.open) {
		return { open: true, marker: fence };
	}
	if (state.marker === fence) {
		return { open: false, marker: null };
	}
	return state;
}

function replaceMarkerLines(
	input: string,
	fromMarker: string,
	toMarker: string,
) {
	const normalizedFromMarker = fromMarker.toLowerCase();
	const lines = input.split("\n");
	let fenceState: CodeFenceState = { open: false, marker: null };
	return lines
		.map((line) => {
			fenceState = updateCodeFenceState(fenceState, line);
			if (
				fenceState.open ||
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
