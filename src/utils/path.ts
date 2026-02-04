export function parentDir(relPath: string): string {
	const idx = relPath.lastIndexOf("/");
	return idx === -1 ? "" : relPath.slice(0, idx);
}

export function isMarkdownPath(relPath: string): boolean {
	return relPath.toLowerCase().endsWith(".md");
}
