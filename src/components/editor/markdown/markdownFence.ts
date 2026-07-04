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
