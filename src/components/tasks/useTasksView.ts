import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { navigationQueryKeys } from "../../lib/navigationPrefetch";
import { invoke, type TaskNoteGroup, type TaskScope } from "../../lib/tauri";
import { buildTaskRows } from "./buildTaskRows";
import { isGroupExpanded } from "./taskGroupState";
import { withCompleting } from "./taskModel";
import { useTaskCompletion } from "./useTaskCompletion";
import { useTaskGroupState } from "./useTaskGroupState";

const EMPTY_GROUPS: readonly TaskNoteGroup[] = [];

/** Tasks data for the pane: the IPC query, held completions, collapse state, and rows. */
export function useTasksView(spacePath: string | null, scope: TaskScope, needle: string) {
	const { t } = useTranslation("shell");
	const query = useQuery({
		queryKey: navigationQueryKeys.tasks(spacePath, scope),
		queryFn: spacePath ? () => invoke("tasks_list", { space_path: spacePath, scope }) : skipToken,
		placeholderData: keepPreviousData,
	});
	const serverGroups = query.data ?? EMPTY_GROUPS;
	// Only an unfiltered list knows every note, so only then may stale overrides be pruned.
	const groupState = useTaskGroupState(
		spacePath,
		scope.kind === "all" && query.data && !query.isPlaceholderData ? serverGroups : null,
	);
	const expansion = groupState.state;
	const completion = useTaskCompletion(spacePath, scope, serverGroups);
	const { completing } = completion;
	const groups = useMemo(
		() => withCompleting(serverGroups, completing),
		[serverGroups, completing],
	);
	const result = useMemo(
		() =>
			buildTaskRows(
				groups,
				needle,
				(notePath) => isGroupExpanded(expansion, notePath),
				completing.entries,
				(completed, total) => t("tasks.fraction", { completed, total }),
			),
		[groups, needle, expansion, completing, t],
	);

	return {
		query,
		...result,
		completion,
		toggleCollapsed: groupState.toggle,
		collapseAll: groupState.collapseAll,
		expandAll: groupState.expandAll,
	};
}
