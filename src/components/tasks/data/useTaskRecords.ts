import { useQuery } from "@tanstack/react-query";
import { useSpace, useUILayoutContext } from "@/contexts";
import { isInTemplatesFolder } from "@/lib/templates";
import type { TaskQueryFilters, TaskRecord, TaskView } from "@/lib/tauri";
import { useTasks } from "../TasksContext";
import { withHeldTasks } from "./heldTasks";
import { tasksViewQueryOptions } from "./taskQueries";

interface UseTaskRecordsOptions {
	view: TaskView;
	filters: TaskQueryFilters;
	enabled?: boolean;
}

const NO_RECORDS: readonly TaskRecord[] = [];

export function useTaskRecords({ view, filters, enabled = true }: UseTaskRecordsOptions) {
	const { spacePath } = useSpace();
	const { templateFolder } = useUILayoutContext();
	const { today, held } = useTasks();
	const query = useQuery({
		...tasksViewQueryOptions({ spacePath, view, filters, today }),
		enabled,
	});
	const showTemplates = filters.folder_prefixes.length > 0 || filters.note_paths.length > 0;
	const fetched = query.data ?? NO_RECORDS;
	const visible = showTemplates
		? fetched
		: fetched.filter((record) => !isInTemplatesFolder(record.note_path, templateFolder));
	return { query, records: withHeldTasks(visible, held) };
}
