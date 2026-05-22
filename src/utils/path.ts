export function parentDir(relPath: string): string {
	const idx = relPath.lastIndexOf("/");
	return idx === -1 ? "" : relPath.slice(0, idx);
}

export function basename(relPath: string): string {
	const parts = relPath.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? relPath;
}

export function splitEditableFileName(name: string): {
	stem: string;
	ext: string;
} {
	const trimmed = name.trim();
	const dotIndex = trimmed.lastIndexOf(".");
	if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
		return { stem: trimmed, ext: "" };
	}
	return {
		stem: trimmed.slice(0, dotIndex),
		ext: trimmed.slice(dotIndex),
	};
}

export function isMarkdownPath(relPath: string): boolean {
	return relPath.toLowerCase().endsWith(".md");
}

export function isFlowPath(relPath: string): boolean {
	return relPath.toLowerCase().endsWith(".flow");
}

export type WorkspaceFileKind = "markdown" | "flow" | "other";

export function workspaceFileKind(relPath: string): WorkspaceFileKind {
	if (isMarkdownPath(relPath)) return "markdown";
	if (isFlowPath(relPath)) return "flow";
	return "other";
}

export function canOpenInWorkspace(relPath: string): boolean {
	const kind = workspaceFileKind(relPath);
	return kind === "markdown" || kind === "flow";
}

export function normalizeRelPath(path: string): string {
	return path
		.trim()
		.replace(/\u200b/g, "")
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
}
