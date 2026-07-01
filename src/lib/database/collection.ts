import type { WorkspaceDatabaseSummary } from "../tauri";

export interface CollectionFolderBreadcrumbPart {
	label: string;
	path: string;
}

export function normalizeCollectionFolderPath(path: string): string {
	return path
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

export function collectionFolderBreadcrumbParts(
	folderPath: string,
): CollectionFolderBreadcrumbPart[] {
	const normalized = normalizeCollectionFolderPath(folderPath);
	if (!normalized) {
		return [{ label: "Space", path: "" }];
	}

	return [
		{ label: "Space", path: "" },
		...normalized.split("/").map((segment, index, segments) => ({
			label: segment,
			path: segments.slice(0, index + 1).join("/"),
		})),
	];
}

export function folderNameFromPath(path: string): string {
	const normalized = normalizeCollectionFolderPath(path);
	const parts = normalized.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

export function nextCollectionName(
	summaries: WorkspaceDatabaseSummary[],
	preferred?: string,
): string {
	const existing = new Set(
		summaries.map((entry) => entry.name.trim().toLowerCase()),
	);
	const base = preferred?.trim() || "New Collection";
	if (!existing.has(base.toLowerCase())) return base;
	let suffix = 2;
	while (existing.has(`${base} ${suffix}`.toLowerCase())) {
		suffix += 1;
	}
	return `${base} ${suffix}`;
}
