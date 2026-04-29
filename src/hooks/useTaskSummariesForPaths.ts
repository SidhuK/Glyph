import { useEffect, useMemo, useRef, useState } from "react";
import { type NoteTaskSummary, invoke } from "../lib/tauri";

export function useTaskSummariesForPaths(
	paths: string[],
	enabled: boolean | null,
	refreshKey = 0,
) {
	const [taskSummariesByPath, setTaskSummariesByPath] = useState<
		Record<string, NoteTaskSummary>
	>({});
	const requestRef = useRef("");
	const taskSummaryPaths = useMemo(
		() => Array.from(new Set(paths.filter(Boolean))).sort(),
		[paths],
	);
	const requestKey = useMemo(
		() => `${refreshKey}:${taskSummaryPaths.join("\0")}`,
		[refreshKey, taskSummaryPaths],
	);

	useEffect(() => {
		requestRef.current = requestKey;
		if (enabled !== true || taskSummaryPaths.length === 0) {
			setTaskSummariesByPath({});
			return;
		}

		let cancelled = false;
		void invoke("task_summaries_for_paths", { note_paths: taskSummaryPaths })
			.then((items) => {
				if (cancelled || requestRef.current !== requestKey) return;
				const next: Record<string, NoteTaskSummary> = {};
				for (const item of items) {
					next[item.note_path] = {
						total_count: item.total_count,
						completed_count: item.completed_count,
						open_count: item.open_count,
					};
				}
				setTaskSummariesByPath(next);
			})
			.catch(() => {
				if (cancelled) return;
				setTaskSummariesByPath({});
			});

		return () => {
			cancelled = true;
		};
	}, [enabled, requestKey, taskSummaryPaths]);

	return taskSummariesByPath;
}
