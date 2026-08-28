import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { DirChildSummary } from "../lib/tauri";
import { invoke } from "../lib/tauri";

const EMPTY_FOLDER_FILE_COUNTS: Record<string, number> = {};

type FolderFileCountsArgs = {
	spacePath: string | null;
	includeNonMarkdown: boolean | null;
	parentDirs: string[];
	treeRevision: string;
};

function countsFromSummaries(
	summaries: DirChildSummary[],
	includeNonMarkdown: boolean,
): Record<string, number> {
	const next: Record<string, number> = {};
	for (const summary of summaries) {
		next[summary.dir_rel_path] = includeNonMarkdown
			? summary.total_files_recursive
			: summary.total_markdown_recursive;
	}
	return next;
}

export function useFolderFileCounts({
	spacePath,
	includeNonMarkdown,
	parentDirs,
	treeRevision,
}: FolderFileCountsArgs): Record<string, number> {
	const dirs = useMemo(
		() => Array.from(new Set(parentDirs)).sort(),
		[parentDirs],
	);
	const enabled =
		Boolean(spacePath) &&
		includeNonMarkdown !== null &&
		dirs.length > 0 &&
		Boolean(treeRevision);

	const countsQuery = useQuery({
		queryKey: [
			"folder-file-counts",
			spacePath,
			includeNonMarkdown,
			dirs,
			treeRevision,
		],
		enabled,
		placeholderData: (previousData, previousQuery) =>
			previousQuery?.queryKey[1] === spacePath &&
			previousQuery.queryKey[2] === includeNonMarkdown
				? previousData
				: undefined,
		queryFn: async () => {
			const summaries = await invoke("space_dir_children_summary", {
				dirs,
			});
			return countsFromSummaries(summaries, includeNonMarkdown === true);
		},
	});

	if (!enabled) {
		return EMPTY_FOLDER_FILE_COUNTS;
	}
	return countsQuery.data ?? EMPTY_FOLDER_FILE_COUNTS;
}
