export interface MarkdownFenceTracker {
	activeFence: string | null;
}

export function createMarkdownFenceTracker(): MarkdownFenceTracker {
	return { activeFence: null };
}

function matchMarkdownCodeFence(line: string): string | null {
	const match = line.trim().match(/^(`{3,}|~{3,})/);
	return match ? match[1] : null;
}

function isClosingFenceFor(openFence: string, closeFence: string): boolean {
	if (openFence[0] !== closeFence[0]) return false;
	return closeFence.length >= openFence.length;
}

export function updateMarkdownFenceTracker(
	line: string,
	tracker: MarkdownFenceTracker,
): boolean {
	const fence = matchMarkdownCodeFence(line);
	if (!fence) return false;

	if (tracker.activeFence === null) {
		tracker.activeFence = fence;
		return true;
	}

	if (isClosingFenceFor(tracker.activeFence, fence)) {
		tracker.activeFence = null;
		return true;
	}

	return false;
}

export function isInsideMarkdownCodeFence(
	tracker: MarkdownFenceTracker,
): boolean {
	return tracker.activeFence !== null;
}

function findInlineCodeClose(
	line: string,
	openStart: number,
	tickCount: number,
): number {
	let search = openStart + tickCount;
	while (search < line.length) {
		const next = line.indexOf("`".repeat(tickCount), search);
		if (next === -1) return -1;
		const before = next > 0 ? line[next - 1] : "";
		const after = line[next + tickCount] ?? "";
		// Closing run must be exactly tickCount and not part of a longer run.
		if (before !== "`" && after !== "`") return next;
		search = next + 1;
	}
	return -1;
}

function transformLineOutsideInlineCode(
	line: string,
	transform: (text: string) => string,
) {
	let output = "";
	let cursor = 0;
	while (cursor < line.length) {
		const tickStart = line.indexOf("`", cursor);
		if (tickStart === -1) {
			output += transform(line.slice(cursor));
			break;
		}
		output += transform(line.slice(cursor, tickStart));
		const tickMatch = line.slice(tickStart).match(/^`+/);
		const ticks = tickMatch?.[0] ?? "`";
		const close = findInlineCodeClose(line, tickStart, ticks.length);
		if (close === -1) {
			output += line.slice(tickStart);
			break;
		}
		output += line.slice(tickStart, close + ticks.length);
		cursor = close + ticks.length;
	}
	return output;
}

/** Transform line-oriented markdown outside fenced/indented code (keeps inline code intact). */
export function transformMarkdownOutsideFences(
	markdown: string,
	transform: (line: string) => string,
) {
	const tracker = createMarkdownFenceTracker();
	return markdown
		.split("\n")
		.map((line) => {
			// Indented code never opens or closes fenced state (incl. inside fences).
			if (/^( {4}|\t)/.test(line)) {
				return line;
			}
			if (updateMarkdownFenceTracker(line, tracker)) return line;
			if (isInsideMarkdownCodeFence(tracker)) return line;
			return transform(line);
		})
		.join("\n");
}

export function transformMarkdownOutsideCode(
	markdown: string,
	transform: (text: string) => string,
) {
	return transformMarkdownOutsideFences(markdown, (line) =>
		transformLineOutsideInlineCode(line, transform),
	);
}
