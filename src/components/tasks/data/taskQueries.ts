import { queryOptions, skipToken } from "@tanstack/react-query";
import { navigationQueryKeys } from "@/lib/navigationPrefetch";
import { invoke, type TaskQueryFilters, type TaskView } from "@/lib/tauri";
import { EMPTY_TASK_FILTERS } from "../viewState/taskViewState";

export const NO_TASK_FILTERS: TaskQueryFilters = { ...EMPTY_TASK_FILTERS, include_done: false };

interface TasksViewQuery {
	spacePath: string | null;
	view: TaskView;
	filters: TaskQueryFilters;
	today: string;
}

export function tasksViewQueryOptions({ spacePath, view, filters, today }: TasksViewQuery) {
	const queryKey = [...navigationQueryKeys.tasks(spacePath), "view", view, filters, today] as const;
	const viewKeyIndex = queryKey.length - 3;
	return queryOptions({
		queryKey,
		queryFn: spacePath
			? () =>
					invoke("tasks_query", {
						request: {
							space_path: spacePath,
							view,
							filters,
							today,
						},
					})
			: skipToken,
		placeholderData: (previous, previousQuery) =>
			previousQuery?.queryKey[viewKeyIndex] === view ? previous : undefined,
	});
}

export function noteTasksQueryOptions(
	spacePath: string | null,
	notePaths: readonly string[],
	today: string,
) {
	const sorted = [...new Set(notePaths)].sort();
	return queryOptions({
		queryKey: [...navigationQueryKeys.tasks(spacePath), "notes", sorted, today] as const,
		queryFn:
			spacePath && sorted.length > 0
				? () =>
						invoke("tasks_query", {
							request: {
								space_path: spacePath,
								view: "all",
								filters: { ...NO_TASK_FILTERS, note_paths: sorted, include_done: true },
								today,
							},
						})
				: skipToken,
	});
}
