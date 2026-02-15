export function parentDir(relPath: string): string {
	const idx = relPath.lastIndexOf("/");
	return idx === -1 ? "" : relPath.slice(0, idx);
}

export function basename(relPath: string): string {
	const parts = relPath.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? relPath;
}

export function isMarkdownPath(relPath: string): boolean {
	return relPath.toLowerCase().endsWith(".md");
}

export function normalizeRelPath(path: string): string {
	return path
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
}
