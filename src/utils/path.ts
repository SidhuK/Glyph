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
	const ext = fileExtension(relPath);
	return ext === "md" || ext === "markdown";
}

const IMAGE_EXTENSIONS = new Set([
	"avif",
	"bmp",
	"gif",
	"jpeg",
	"jpg",
	"png",
	"svg",
	"tif",
	"tiff",
	"webp",
]);

export function fileExtension(path: string): string {
	const name = basename(path);
	const dotIndex = name.lastIndexOf(".");
	if (dotIndex <= 0 || dotIndex === name.length - 1) return "";
	return name.slice(dotIndex + 1).toLowerCase();
}

export function hasExplicitFileExtension(path: string): boolean {
	const ext = fileExtension(path);
	return ext.length > 0 && !/\s/.test(ext);
}

export function isImagePath(path: string): boolean {
	return IMAGE_EXTENSIONS.has(fileExtension(path));
}

export function isPdfPath(path: string): boolean {
	return fileExtension(path) === "pdf";
}

export function isMarkdownCreatablePath(path: string): boolean {
	const ext = fileExtension(path);
	return ext === "md" || ext === "markdown" || !hasExplicitFileExtension(path);
}

export function isPreviewableNotePath(path: string): boolean {
	const normalized = normalizeRelPath(path.split("#", 1)[0] ?? path);
	const filename = basename(normalized);
	if (!filename) return false;
	return isMarkdownCreatablePath(filename);
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
