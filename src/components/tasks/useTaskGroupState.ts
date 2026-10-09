import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TaskNoteGroup } from "../../lib/tauri";
import { toast } from "../../lib/toast";
import {
	DEFAULT_TASK_GROUP_STATE,
	loadTaskGroupState,
	saveTaskGroupState,
	type TaskGroupState,
	withAllGroups,
	withGroupToggled,
	withKnownOverrides,
} from "./taskGroupState";

/** Persisted, per-space expanded/collapsed state of the Tasks pane's note groups. */
export function useTaskGroupState(
	spacePath: string | null,
	/** Every note with open tasks (unfiltered list), or null when unknown. */
	knownGroups: readonly TaskNoteGroup[] | null,
) {
	const { t } = useTranslation("shell");
	const queryClient = useQueryClient();
	const queryKey = ["tasks", "group-state", spacePath] as const;
	const query = useQuery({
		queryKey,
		queryFn: spacePath ? () => loadTaskGroupState(spacePath) : skipToken,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const state = query.data ?? DEFAULT_TASK_GROUP_STATE;
	const save = useMutation({
		mutationFn: (next: TaskGroupState) =>
			spacePath ? saveTaskGroupState(spacePath, next) : Promise.resolve(),
		onError: (error) =>
			toast.error(t("tasks.groupStateSaveFailed"), { description: error.message }),
	});

	const update = (next: TaskGroupState) => {
		const pruned = knownGroups ? withKnownOverrides(next, knownGroups) : next;
		queryClient.setQueryData(queryKey, pruned);
		save.mutate(pruned);
	};

	return {
		state,
		toggle: (notePath: string) => update(withGroupToggled(state, notePath)),
		collapseAll: () => update(withAllGroups(false)),
		expandAll: () => update(withAllGroups(true)),
	};
}
