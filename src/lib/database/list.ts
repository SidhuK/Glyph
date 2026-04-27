import type { DatabaseRow } from "./types";

export function databaseListTitle(row: DatabaseRow): string {
	const indexedTitle = row.title.trim();
	if (indexedTitle) return indexedTitle;
	const base = row.note_path.split("/").pop() ?? row.note_path;
	return base.replace(/\.md$/i, "") || "Untitled";
}

export function databaseListFolderPath(row: DatabaseRow): string {
	const folder = row.folder?.trim();
	if (folder) return folder.endsWith("/") ? folder : `${folder}/`;

	const slashIndex = row.note_path.lastIndexOf("/");
	if (slashIndex <= 0) return "/";
	const parent = row.note_path.slice(0, slashIndex);
	return parent.endsWith("/") ? parent : `${parent}/`;
}

export function visibleDatabaseListTags(
	tags: string[],
	limit = 3,
): { visibleTags: string[]; extraTagCount: number } {
	const visibleTags = tags.slice(0, limit);
	return {
		visibleTags,
		extraTagCount: Math.max(tags.length - visibleTags.length, 0),
	};
}
