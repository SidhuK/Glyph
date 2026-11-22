import { useArchivedPaths } from "./useNoteArchive";
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
			: summary.total_documents_recursive;
	}
	return next;
}

export function useFolderFileCounts({
	spacePath,
	includeNonMarkdown,
	parentDirs,
	treeRevision,
}: FolderFileCountsArgs): Record<string, number> {
	const archivedPaths = useArchivedPaths();
	const dirs = useMemo(() => Array.from(new Set(parentDirs)).sort(), [parentDirs]);
	const enabled =
		Boolean(spacePath) && includeNonMarkdown !== null && dirs.length > 0 && Boolean(treeRevision);

	const countsQuery = useQuery({
		queryKey: ["folder-file-counts", spacePath, includeNonMarkdown, dirs, treeRevision],
		enabled,
		placeholderData: (previousData, previousQuery) =>
			previousQuery?.queryKey[1] === spacePath && previousQuery.queryKey[2] === includeNonMarkdown
				? previousData
				: undefined,
		queryFn: async () => {
			const summaries = await invoke("space_dir_children_summary", {
				dirs,
			});
			return countsFromSummaries(summaries, includeNonMarkdown === true);
		},
	});

	const activeCounts = useMemo(() => {
		if (!countsQuery.data || !archivedPaths.data?.size) {
			return countsQuery.data ?? EMPTY_FOLDER_FILE_COUNTS;
		}
		const archivedCounts = new Map<string, number>();
		for (const path of archivedPaths.data) {
			archivedCounts.set("", (archivedCounts.get("") ?? 0) + 1);
			let end = path.indexOf("/");
			while (end !== -1) {
				const dir = path.slice(0, end);
				archivedCounts.set(dir, (archivedCounts.get(dir) ?? 0) + 1);
				end = path.indexOf("/", end + 1);
			}
		}
		return Object.fromEntries(
			Object.entries(countsQuery.data).map(([dir, count]) => [
				dir,
				Math.max(0, count - (archivedCounts.get(dir) ?? 0)),
			]),
		);
	}, [countsQuery.data, archivedPaths.data]);
	return enabled ? activeCounts : EMPTY_FOLDER_FILE_COUNTS;
}
