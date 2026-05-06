import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { navigationQueryKeys } from "../lib/navigationPrefetch";
import { type NoteTaskSummary, invoke } from "../lib/tauri";

export function useTaskSummariesForPaths(
	paths: string[],
	enabled: boolean | null,
	refreshKey = 0,
) {
	const taskSummaryPaths = useMemo(
		() => Array.from(new Set(paths.filter(Boolean))).sort(),
		[paths],
	);
	const summariesQuery = useQuery({
		queryKey: [
			...navigationQueryKeys.taskSummaries(),
			refreshKey,
			taskSummaryPaths,
		],
		enabled: enabled === true && taskSummaryPaths.length > 0,
		placeholderData: (previousData) => previousData,
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

	return summariesQuery.data ?? {};
}
