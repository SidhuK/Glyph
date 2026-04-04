const MARKDOWN_DOC_CACHE_MAX_ENTRIES = 12;
const MARKDOWN_DOC_CACHE_MAX_CHARS = 2_000_000;

const markdownDocCache = new Map<string, string>();

function trimMarkdownDocCache() {
	while (markdownDocCache.size > MARKDOWN_DOC_CACHE_MAX_ENTRIES) {
		const oldestKey = markdownDocCache.keys().next().value;
		if (oldestKey === undefined) break;
		markdownDocCache.delete(oldestKey);
	}

	let totalChars = 0;
	for (const value of markdownDocCache.values()) {
		totalChars += value.length;
	}
	while (totalChars > MARKDOWN_DOC_CACHE_MAX_CHARS) {
		const oldestKey = markdownDocCache.keys().next().value;
		if (oldestKey === undefined) break;
		const removed = markdownDocCache.get(oldestKey);
		markdownDocCache.delete(oldestKey);
		totalChars -= removed?.length ?? 0;
	}
}

export function clearMarkdownDocCache() {
	markdownDocCache.clear();
}

export function getCachedMarkdownDoc(relPath: string): string | undefined {
	const cached = markdownDocCache.get(relPath);
	if (typeof cached !== "string") return undefined;
	markdownDocCache.delete(relPath);
	markdownDocCache.set(relPath, cached);
	return cached;
}

export function peekCachedMarkdownDoc(relPath: string): string | undefined {
	return markdownDocCache.get(relPath);
}

export function setCachedMarkdownDoc(relPath: string, text: string) {
	markdownDocCache.delete(relPath);
	markdownDocCache.set(relPath, text);
	trimMarkdownDocCache();
}
