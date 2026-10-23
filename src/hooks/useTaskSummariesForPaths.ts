import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useFileTreeContext } from "../contexts";
import { peekCachedMarkdownDoc } from "../components/preview/markdownCache";
import { summarizeChecklistsFromMarkdown } from "../lib/checklistSummary";
import { navigationQueryKeys } from "../lib/navigationPrefetch";
import { type NoteTaskSummary, invoke } from "../lib/tauri";

const EMPTY_TASK_SUMMARIES: Record<string, NoteTaskSummary> = {};

function summarizeFromCachedMarkdown(paths: string[]): Record<string, NoteTaskSummary> {
	const next: Record<string, NoteTaskSummary> = {};
	for (const path of paths) {
		const cached = peekCachedMarkdownDoc(path);
		if (!cached) continue;
		const summary = summarizeChecklistsFromMarkdown(cached);
		if (summary.total_count > 0) {
			next[path] = summary;
		}
	}
	return next;
}

/** Returns no summaries while the task progress rings setting is off, so every ring hides. */
export function useTaskSummariesForPaths(paths: string[], enabled: boolean | null) {
	const { showTaskProgressRings } = useFileTreeContext();
	const active = enabled === true && showTaskProgressRings;
	const taskSummaryPaths = useMemo(
		() => (active ? Array.from(new Set(paths.filter(Boolean))).sort() : []),
		[active, paths],
	);
	const cachedSummaries = useMemo(
		() => summarizeFromCachedMarkdown(taskSummaryPaths),
		[taskSummaryPaths],
	);
	const summariesQuery = useQuery({
		queryKey: [...navigationQueryKeys.taskSummaries(), taskSummaryPaths],
		enabled: active && taskSummaryPaths.length > 0,
		staleTime: 30_000,
		placeholderData: (previousData) =>
			previousData && Object.keys(previousData).length > 0 ? previousData : cachedSummaries,
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
		if (!active) return EMPTY_TASK_SUMMARIES;
		if (summariesQuery.isSuccess) {
			return summariesQuery.data ?? EMPTY_TASK_SUMMARIES;
		}
		if (Object.keys(cachedSummaries).length > 0) {
			return cachedSummaries;
		}
		return EMPTY_TASK_SUMMARIES;
	}, [active, cachedSummaries, summariesQuery.data, summariesQuery.isSuccess]);
}
