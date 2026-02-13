import type { FsEntry } from "../lib/tauri";

export function compareEntries(a: FsEntry, b: FsEntry): number {
	if (a.kind === "dir" && b.kind === "file") return -1;
	if (a.kind === "file" && b.kind === "dir") return 1;
	return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

export function normalizeRelPath(relPath: string): string {
	const normalized = relPath.replace(/\\/g, "/").trim();
	return normalized.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function entryNameFromRelPath(relPath: string): string {
	const parts = relPath.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? "";
}

export function fileTitleFromRelPath(relPath: string): string {
	const name = entryNameFromRelPath(relPath);
	if (!name) return "Untitled";
	return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

export function normalizeEntry(entry: FsEntry): FsEntry | null {
	const relPath = normalizeRelPath(entry.rel_path);
	if (!relPath) return null;
	const relName = entryNameFromRelPath(relPath);
	const name =
		entry.name.replace(/\u200b/g, "").trim() ||
		relName ||
		(entry.kind === "dir" ? "New Folder" : "Untitled.md");
	return {
		...entry,
		name,
		rel_path: relPath,
	};
}

export function normalizeEntries(entries: FsEntry[]): FsEntry[] {
	const byPath = new Map<string, FsEntry>();
	for (const entry of entries) {
		const normalized = normalizeEntry(entry);
		if (!normalized) continue;
		byPath.set(normalized.rel_path, normalized);
	}
	return [...byPath.values()].sort(compareEntries);
}

export function areEntriesEqual(
	a: FsEntry[] | undefined,
	b: FsEntry[],
): boolean {
	if (!a) return false;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i += 1) {
		const left = a[i];
		const right = b[i];
		if (!left || !right) return false;
		if (
			left.rel_path !== right.rel_path ||
			left.name !== right.name ||
			left.kind !== right.kind ||
			left.is_markdown !== right.is_markdown
		) {
			return false;
		}
	}
	return true;
}

export function withInsertedEntry(
	entries: FsEntry[],
	entry: FsEntry,
): FsEntry[] {
	if (entries.some((e) => e.rel_path === entry.rel_path)) return entries;
	return [...entries, entry].sort(compareEntries);
}

export function rewritePrefix(path: string, from: string, to: string): string {
	if (path === from) return to;
	if (path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`;
	return path;
}

export function shouldRefreshActiveFolderView(
	activeFolderDir: string | null,
	createdInDir: string,
): boolean {
	return activeFolderDir !== null && activeFolderDir === createdInDir;
}
