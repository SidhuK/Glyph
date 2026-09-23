import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { DirChildSummary } from "../lib/tauri";
import { invoke } from "../lib/tauri";

const EMPTY_FOLDER_FILE_COUNTS: Record<string, number> = {};

type FolderFileCountsArgs = {
	spacePath: string | null;
	parentDirs: string[];
	treeRevision: string;
};

function countsFromSummaries(summaries: DirChildSummary[]): Record<string, number> {
	const next: Record<string, number> = {};
	for (const summary of summaries) {
		next[summary.dir_rel_path] = summary.total_files_recursive;
	}
	return next;
}

export function useFolderFileCounts({
	spacePath,
	parentDirs,
	treeRevision,
}: FolderFileCountsArgs): Record<string, number> {
	const dirs = useMemo(() => Array.from(new Set(parentDirs)).sort(), [parentDirs]);
	const enabled = Boolean(spacePath) && dirs.length > 0 && Boolean(treeRevision);

	const countsQuery = useQuery({
		queryKey: ["folder-file-counts", spacePath, dirs, treeRevision],
		enabled,
		placeholderData: (previousData, previousQuery) => {
			if (previousQuery?.queryKey[1] === spacePath) return previousData;
			return undefined;
		},
		queryFn: async () => {
			const summaries = await invoke("space_dir_children_summary", {
				dirs,
			});
			return countsFromSummaries(summaries);
		},
	});

	if (!enabled) {
		return EMPTY_FOLDER_FILE_COUNTS;
	}
	return countsQuery.data ?? EMPTY_FOLDER_FILE_COUNTS;
}
