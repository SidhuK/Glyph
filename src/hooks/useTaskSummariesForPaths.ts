import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { summarizeChecklistsFromMarkdown } from "../lib/checklistSummary";
import {
	getPrefetchedNote,
	navigationQueryKeys,
} from "../lib/navigationPrefetch";
import { type NoteTaskSummary, invoke } from "../lib/tauri";

const EMPTY_TASK_SUMMARIES: Record<string, NoteTaskSummary> = {};

function summarizeFromPrefetchedNotes(
	paths: string[],
): Record<string, NoteTaskSummary> {
	const next: Record<string, NoteTaskSummary> = {};
	for (const path of paths) {
		const note = getPrefetchedNote(path);
		if (!note) continue;
		const summary = summarizeChecklistsFromMarkdown(note.text);
		if (summary.total_count > 0) {
			next[path] = summary;
		}
	}
	return next;
}

export function useTaskSummariesForPaths(
	paths: string[],
	enabled: boolean | null,
) {
	const taskSummaryPaths = useMemo(
		() => Array.from(new Set(paths.filter(Boolean))).sort(),
		[paths],
	);
	const prefetchedSummaries = useMemo(
		() => summarizeFromPrefetchedNotes(taskSummaryPaths),
		[taskSummaryPaths],
	);
	const summariesQuery = useQuery({
		queryKey: [...navigationQueryKeys.taskSummaries(), taskSummaryPaths],
		enabled: enabled === true && taskSummaryPaths.length > 0,
		staleTime: 30_000,
		placeholderData: (previousData) =>
			previousData && Object.keys(previousData).length > 0
				? previousData
				: prefetchedSummaries,
		queryFn: async () => {
			const items = await invoke("task_summaries_for_paths", {
				note_paths: taskSummaryPaths,
			});
			const next: Record<string, NoteTaskSummary> = {};
			for (const item of items) {
				next[item.note_path] = {
					total_count: item.total_count,
					completed_count: item.completed_count,
					open_count: item.open_count,
				};
			}
			return next;
		},
	});

	return useMemo(() => {
		if (summariesQuery.isSuccess) {
			return summariesQuery.data ?? EMPTY_TASK_SUMMARIES;
		}
		if (Object.keys(prefetchedSummaries).length > 0) {
			return prefetchedSummaries;
		}
		return EMPTY_TASK_SUMMARIES;
	}, [prefetchedSummaries, summariesQuery.data, summariesQuery.isSuccess]);
}
