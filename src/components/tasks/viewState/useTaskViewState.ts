import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "@/lib/toast";
import type { TaskDisplayState } from "../model/taskDisplay";
import {
	DEFAULT_TASK_VIEW_STATE,
	type TaskFilterState,
	type TaskViewState,
	loadTaskViewState,
	saveTaskViewState,
} from "./taskViewState";

export function useTaskViewState(spacePath: string | null) {
	const { t } = useTranslation("shell");
	const queryClient = useQueryClient();
	const queryKey = ["tasks", "view-state", spacePath] as const;
	const query = useQuery({
		queryKey,
		queryFn: spacePath ? () => loadTaskViewState(spacePath) : skipToken,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const state = query.data ?? DEFAULT_TASK_VIEW_STATE;
	const save = useMutation({
		mutationFn: (next: TaskViewState) =>
			spacePath ? saveTaskViewState(spacePath, next) : Promise.resolve(),
		onMutate: (next) => {
			const previous = queryClient.getQueryData<TaskViewState>(queryKey);
			queryClient.setQueryData(queryKey, next);
			return { previous };
		},
		onError: (error, next, context) => {
			toast.error(t("tasks.viewStateSaveFailed"), { description: error.message });
			const isLatest = queryClient.getQueryData(queryKey) === next;
			if (isLatest && context?.previous) queryClient.setQueryData(queryKey, context.previous);
		},
	});

	const update = (next: TaskViewState) => {
		if (!query.isSuccess) return;
		save.mutate(next);
	};

	return {
		query,
		state,
		ready: query.isSuccess || !spacePath,
		setFilters: (filters: TaskFilterState) => update({ ...state, filters }),
		setDisplay: (patch: Partial<TaskDisplayState>) =>
			update({ ...state, display: { ...state.display, ...patch } }),
	};
}
