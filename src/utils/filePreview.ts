export type InAppPreviewKind = "image" | "pdf" | "text";

const IMAGE_EXTS = new Set([
	"png",
	"jpg",
	"jpeg",
	"webp",
	"gif",
	"svg",
	"bmp",
	"avif",
	"tiff",
]);

function extForPath(relPath: string): string {
	const file = relPath.split("/").pop() ?? relPath;
	const dot = file.lastIndexOf(".");
	if (dot <= 0 || dot === file.length - 1) return "";
	return file.slice(dot + 1).toLowerCase();
}

export function getInAppPreviewKind(relPath: string): InAppPreviewKind | null {
	const ext = extForPath(relPath);
	if (!ext) return null;
	if (IMAGE_EXTS.has(ext)) return "image";
	if (ext === "pdf") return "pdf";
	if (ext === "txt") return "text";
	return null;
}

export function isInAppPreviewable(relPath: string): boolean {
	return getInAppPreviewKind(relPath) !== null;
}
