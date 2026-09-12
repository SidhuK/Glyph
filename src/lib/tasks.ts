import { queryOptions } from "@tanstack/react-query";
import { invoke } from "./tauri";

export const TASKS_TAB_ID = "__glyph_tasks__";
export const taskQueryKey = ["task-inbox"] as const;
export const tasksQueryOptions = (spacePath: string | null) =>
	queryOptions({
		queryKey: [...taskQueryKey, spacePath],
		queryFn: () => invoke("tasks_list"),
		enabled: Boolean(spacePath),
	});
