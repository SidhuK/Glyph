import type { FsEntry } from "../lib/tauri";

export interface FileTreeMoveOptions {
	index?: number;
}

export type FileTreeOrderByDir = Record<string, string[]>;

export const ROOT_FILE_TREE_ORDER_KEY = "__root__";

export function compareEntries(a: FsEntry, b: FsEntry): number {
	if (a.kind === "dir" && b.kind === "file") return -1;
	if (a.kind === "file" && b.kind === "dir") return 1;
	return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

export function normalizeRelPath(relPath: string): string {
	const normalized = relPath
		.replace(/\u200b/g, "")
		.replace(/\\/g, "/")
		.trim();
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

export function getFileTreeOrderKey(dirPath: string): string {
	const normalized = normalizeRelPath(dirPath);
	return normalized || ROOT_FILE_TREE_ORDER_KEY;
}

export function applyEntryOrder(
	entries: FsEntry[],
	dirPath: string,
	orderByDir: FileTreeOrderByDir,
): FsEntry[] {
	if (entries.length <= 1) return entries;
	const storedOrder = orderByDir[getFileTreeOrderKey(dirPath)] ?? [];
	if (storedOrder.length === 0) return entries;
	const indexByPath = new Map(
		storedOrder.map((path, index) => [normalizeRelPath(path), index]),
	);
	return [...entries].sort((left, right) => {
		const leftIndex = indexByPath.get(left.rel_path);
		const rightIndex = indexByPath.get(right.rel_path);
		if (leftIndex !== undefined && rightIndex !== undefined) {
			return leftIndex - rightIndex;
		}
		if (leftIndex !== undefined) return -1;
		if (rightIndex !== undefined) return 1;
		return compareEntries(left, right);
	});
}

export function clampInsertionIndex(index: number | undefined, length: number): number {
	if (typeof index !== "number" || !Number.isFinite(index)) return length;
	return Math.max(0, Math.min(length, Math.trunc(index)));
}

export function insertPathAtIndex(
	paths: string[],
	path: string,
	index: number | undefined,
): string[] {
	const normalizedPath = normalizeRelPath(path);
	const filtered = Array.from(
		new Set(paths.map((entry) => normalizeRelPath(entry)).filter(Boolean)),
	).filter((entry) => entry !== normalizedPath);
	if (!normalizedPath) return filtered;
	const targetIndex = clampInsertionIndex(index, filtered.length);
	return [
		...filtered.slice(0, targetIndex),
		normalizedPath,
		...filtered.slice(targetIndex),
	];
}

export function rewriteFileTreeOrderPaths(
	orderByDir: FileTreeOrderByDir,
	fromPath: string,
	toPath: string,
): FileTreeOrderByDir {
	const from = normalizeRelPath(fromPath);
	const to = normalizeRelPath(toPath);
	if (!from || !to || from === to) return { ...orderByDir };

	const rewrite = (path: string) => {
		if (path === from) return to;
		if (path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`;
		return path;
	};

	const next: FileTreeOrderByDir = {};
	for (const [rawDirKey, rawPaths] of Object.entries(orderByDir)) {
		const nextDirKey =
			rawDirKey === ROOT_FILE_TREE_ORDER_KEY
				? ROOT_FILE_TREE_ORDER_KEY
				: getFileTreeOrderKey(rewrite(rawDirKey));
		const nextPaths = Array.from(
			new Set(rawPaths.map((path) => rewrite(normalizeRelPath(path))).filter(Boolean)),
		);
		if (nextPaths.length > 0) {
			next[nextDirKey] = Array.from(
				new Set([...(next[nextDirKey] ?? []), ...nextPaths]),
			);
		}
	}
	return next;
}

export function removeFileTreeOrderPaths(
	orderByDir: FileTreeOrderByDir,
	targetPath: string,
): FileTreeOrderByDir {
	const target = normalizeRelPath(targetPath);
	if (!target) return { ...orderByDir };

	const next: FileTreeOrderByDir = {};
	for (const [rawDirKey, rawPaths] of Object.entries(orderByDir)) {
		if (
			rawDirKey !== ROOT_FILE_TREE_ORDER_KEY &&
			(rawDirKey === target || rawDirKey.startsWith(`${target}/`))
		) {
			continue;
		}
		const nextPaths = rawPaths.filter(
			(path) => path !== target && !path.startsWith(`${target}/`),
		);
		if (nextPaths.length > 0) next[rawDirKey] = nextPaths;
	}
	return next;
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
