import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useUILayoutContext } from "../../contexts";
import { navigationQueryKeys } from "../../lib/navigationPrefetch";
import { invoke, type TaskNoteGroup, type TaskScope } from "../../lib/tauri";
import { isInTemplatesFolder } from "../../lib/templates";
import { buildTaskRows, sortTaskGroups, type TaskSortMode } from "./buildTaskRows";
import { isGroupExpanded } from "./taskGroupState";
import { withCompleting } from "./taskModel";
import { useTaskCompletion } from "./useTaskCompletion";
import { useTaskGroupState } from "./useTaskGroupState";

const EMPTY_GROUPS: readonly TaskNoteGroup[] = [];

/** Tasks data for the pane: the IPC query, held completions, collapse state, and rows. */
export function useTasksView(
	spacePath: string | null,
	scope: TaskScope,
	needle: string,
	sort: TaskSortMode,
) {
	const { t } = useTranslation("shell");
	const { templateFolder } = useUILayoutContext();
	const query = useQuery({
		queryKey: navigationQueryKeys.tasks(spacePath, scope),
		queryFn: spacePath ? () => invoke("tasks_list", { space_path: spacePath, scope }) : skipToken,
		placeholderData: keepPreviousData,
	});
	// Template checkboxes are scaffolding, not work: hide them unless a folder is chosen on purpose.
	const hiddenTemplateFolder = scope.kind === "folder" ? null : templateFolder;
	const serverGroups = useMemo(
		() =>
			sortTaskGroups(
				(query.data ?? EMPTY_GROUPS).filter(
					(group) => !isInTemplatesFolder(group.note_path, hiddenTemplateFolder),
				),
				sort,
			),
		[query.data, hiddenTemplateFolder, sort],
	);
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
	const anyExpanded = groups.some((group) => isGroupExpanded(expansion, group.note_path));

	return {
		query,
		...result,
		anyExpanded,
		completion,
		toggleCollapsed: groupState.toggle,
		toggleAll: () => (anyExpanded ? groupState.collapseAll() : groupState.expandAll()),
	};
}
