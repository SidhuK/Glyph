import type { FsEntry } from "../../lib/tauri";

export function basename(path: string): string {
	const parts = path.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

export function fileTitleFromPath(path: string): string {
	return basename(path).replace(/\.md$/i, "").trim() || "Untitled";
}

export function normalizeWikiLinkTarget(target: string): string {
	return target.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

export function resolveWikiLinkPath(
	target: string,
	entries: FsEntry[],
): string | null {
	const normalized = normalizeWikiLinkTarget(target).replace(/\.md$/i, "");
	if (!normalized) return null;
	const lowered = normalized.toLowerCase();

	const exactPath = entries.find(
		(entry) => entry.rel_path.replace(/\.md$/i, "").toLowerCase() === lowered,
	);
	if (exactPath) return exactPath.rel_path;

	const exactTitle = entries.find((entry) => {
		const title = fileTitleFromPath(entry.rel_path).toLowerCase();
		return title === lowered;
	});
	if (exactTitle) return exactTitle.rel_path;

	const suffixPath = entries.find((entry) =>
		entry.rel_path.replace(/\.md$/i, "").toLowerCase().endsWith(`/${lowered}`),
	);
	return suffixPath?.rel_path ?? null;
}

export function aiNoteFileName(): string {
	const now = new Date();
	const pad = (n: number) => n.toString().padStart(2, "0");
	return `AI Note ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
		now.getDate(),
	)} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(
		now.getSeconds(),
	)}.md`;
}

export function normalizeRelPath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "")
		.trim();
}

export function parentDir(path: string): string {
	const normalized = normalizeRelPath(path);
	const idx = normalized.lastIndexOf("/");
	if (idx < 0) return "";
	return normalized.slice(0, idx);
}
