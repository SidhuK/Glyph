import { useQuery } from "@tanstack/react-query";
import { navigationQueryKeys } from "../../lib/navigationPrefetch";
import { invoke } from "../../lib/tauri";
import { parentDir } from "../../utils/path";

const COLLECTION_FOLDER_LIMIT = 5000;

export interface CollectionFolder {
	path: string;
	noteCount: number;
}

export function collectionFoldersQueryKey(spacePath: string | null) {
	return [...navigationQueryKeys.all, "collection-folders", spacePath] as const;
}

async function loadCollectionFolders(): Promise<CollectionFolder[]> {
	const dirs = await invoke("space_list_dir", {
		recursive: true,
		directories_only: true,
		limit: COLLECTION_FOLDER_LIMIT,
	});
	if (dirs.length === 0) return [];
	const parents = Array.from(new Set(dirs.map((dir) => parentDir(dir.rel_path))));
	const summaries = await invoke("space_dir_children_summary", { dirs: parents });
	const countByPath = new Map(
		summaries.map((summary) => [summary.dir_rel_path, summary.total_files_recursive]),
	);
	return dirs
		.map((dir) => ({ path: dir.rel_path, noteCount: countByPath.get(dir.rel_path) ?? 0 }))
		.sort((left, right) => left.path.localeCompare(right.path));
}

export function useCollectionFolders(spacePath: string | null) {
	return useQuery({
		queryKey: collectionFoldersQueryKey(spacePath),
		queryFn: loadCollectionFolders,
		enabled: Boolean(spacePath),
	});
}

export function busiestCollectionFolder(folders: CollectionFolder[]): string | null {
	let busiest: CollectionFolder | null = null;
	for (const folder of folders) {
		if (!busiest || folder.noteCount > busiest.noteCount) busiest = folder;
	}
	return busiest?.path ?? null;
}
