import type { FileTreeSortMode } from "../lib/settings";
import type { FsEntry } from "../lib/tauri";
import { normalizeRelPath } from "../utils/path";

export function filterVisibleFileTreeEntries(
	entries: FsEntry[],
	showNonMarkdownFiles: boolean,
): FsEntry[] {
	if (showNonMarkdownFiles) return entries;
	return entries.filter((entry) => entry.kind === "dir" || entry.is_markdown);
}

export function hasVisibleFileTreeEntries(
	entries: FsEntry[],
	showNonMarkdownFiles: boolean,
): boolean {
	if (showNonMarkdownFiles) return entries.length > 0;
	return entries.some((entry) => entry.kind === "dir" || entry.is_markdown);
}

function compareEntryNames(a: FsEntry, b: FsEntry, direction: 1 | -1): number {
	const byName = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
	if (byName !== 0) return byName * direction;
	return a.rel_path.toLowerCase().localeCompare(b.rel_path.toLowerCase());
}

function timestampValue(
	entry: FsEntry,
	field: "created" | "updated",
): number | null {
	const raw = entry[field];
	if (!raw) return null;
	const parsed = Date.parse(raw);
	return Number.isFinite(parsed) ? parsed : null;
}

function compareEntryTimestamps(
	a: FsEntry,
	b: FsEntry,
	field: "created" | "updated",
	direction: 1 | -1,
): number {
	const left = timestampValue(a, field);
	const right = timestampValue(b, field);
	if (left !== null && right === null) return -1;
	if (left === null && right !== null) return 1;
	if (left !== null && right !== null && left !== right) {
		return (left - right) * direction;
	}
	return compareEntryNames(a, b, 1);
}

export function compareEntriesForSort(
	mode: FileTreeSortMode,
): (a: FsEntry, b: FsEntry) => number {
	return (a, b) => {
		if (a.kind === "dir" && b.kind === "file") return -1;
		if (a.kind === "file" && b.kind === "dir") return 1;
		switch (mode) {
			case "name-desc":
				return compareEntryNames(a, b, -1);
			case "modified-desc":
				return compareEntryTimestamps(a, b, "updated", -1);
			case "modified-asc":
				return compareEntryTimestamps(a, b, "updated", 1);
			case "created-desc":
				return compareEntryTimestamps(a, b, "created", -1);
			case "created-asc":
				return compareEntryTimestamps(a, b, "created", 1);
			case "name-asc":
				return compareEntryNames(a, b, 1);
		}
		const exhaustive: never = mode;
		return exhaustive;
	};
}

const compareEntriesNameAsc = compareEntriesForSort("name-asc");

export function compareEntries(a: FsEntry, b: FsEntry): number {
	return compareEntriesNameAsc(a, b);
}

function entryNameFromRelPath(relPath: string): string {
	const parts = relPath.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? "";
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
			left.is_markdown !== right.is_markdown ||
			left.created !== right.created ||
			left.updated !== right.updated
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
