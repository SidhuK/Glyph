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

export function isPreviewableNotePath(path: string): boolean {
	const normalized = normalizeRelPath(path.split("#", 1)[0] ?? path);
	const filename = basename(normalized);
	if (!filename) return false;
	if (filename.includes(".") && !filename.toLowerCase().endsWith(".md")) {
		return false;
	}
	return true;
}

export function displayNameFromPath(relPath: string): string {
	const fileName = basename(relPath);
	if (!fileName || fileName.startsWith(".")) return fileName || relPath;
	const withoutExt = fileName.replace(/\.[^./]+$/, "");
	return withoutExt || fileName;
}

export function displayFolderFromPath(relPath: string): string {
	const parts = relPath.split("/").filter(Boolean);
	if (parts.length <= 1) return "";
	return parts.slice(0, -1).join(" / ");
}

export function normalizeRelPath(path: string): string {
	return path
		.trim()
		.replace(/\u200b/g, "")
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
}
