import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { navigationQueryKeys } from "../../lib/navigationPrefetch";
import { invoke, type TaskItem, type TaskNoteGroup, type TaskScope } from "../../lib/tauri";
import { toast } from "../../lib/toast";

export const TOGGLE_TASK_MUTATION_KEY = ["tasks", "toggle"] as const;

/** One id for every toggle failure, so a failed burst shows a single toast. */
const TOGGLE_ERROR_TOAST_ID = "tasks-toggle-error";

interface ToggleTaskVariables {
	group: TaskNoteGroup;
	item: TaskItem;
	checked: boolean;
}

interface ToggleTaskCallbacks {
	onSaved: (variables: ToggleTaskVariables, etag: string) => void;
	onFailed: (variables: ToggleTaskVariables) => void;
}

function toggleErrorKey(message: string) {
	if (message.includes("conflict: task was rolled over")) return "tasks.conflictRolledOver";
	if (message.includes("conflict: note changed")) return "tasks.conflictChanged";
	return null;
}

/**
 * Writes one checkbox per call. All toggles share one mutation scope, so they run one
 * after another and each reads the etag the previous write left in the cache.
 */
export function useToggleTask(
	spacePath: string | null,
	scope: TaskScope,
	{ onSaved, onFailed }: ToggleTaskCallbacks,
) {
	const { t } = useTranslation("shell");
	const queryClient = useQueryClient();
	const queryKey = navigationQueryKeys.tasks(scope);

	const currentEtag = ({ group }: ToggleTaskVariables) =>
		queryClient
			.getQueryData<TaskNoteGroup[]>(queryKey)
			?.find((entry) => entry.note_path === group.note_path)?.etag ?? group.etag;

	const mutation = useMutation({
		mutationKey: TOGGLE_TASK_MUTATION_KEY,
		scope: { id: "tasks-toggle" },
		mutationFn: (variables: ToggleTaskVariables) => {
			if (!spacePath) throw new Error(t("tasks.toggleFailed"));
			return invoke("tasks_toggle", {
				request: {
					space_path: spacePath,
					note_path: variables.group.note_path,
					etag: currentEtag(variables),
					start: variables.item.start,
					checked: variables.checked,
				},
			});
		},
		onSuccess: (outcome, variables) => {
			if (outcome.kind === "index_failed") toast.warning(t("tasks.indexFailed"));
			queryClient.setQueryData<TaskNoteGroup[]>(queryKey, (current) =>
				current?.map((entry) =>
					entry.note_path === variables.group.note_path ? { ...entry, etag: outcome.etag } : entry,
				),
			);
			onSaved(variables, outcome.etag);
		},
		onError: (error, variables) => {
			onFailed(variables);
			const conflictKey = toggleErrorKey(error.message);
			const title = t(conflictKey ?? "tasks.toggleFailed");
			const description = conflictKey || error.message === title ? undefined : error.message;
			toast.error(title, { id: TOGGLE_ERROR_TOAST_ID, ...(description ? { description } : {}) });
		},
		onSettled: () => {
			// Refetch only after the last in-flight toggle, so an earlier refetch cannot
			// bring back a row whose write is still pending.
			if (queryClient.isMutating({ mutationKey: TOGGLE_TASK_MUTATION_KEY }) !== 1) return;
			void queryClient.invalidateQueries({ queryKey });
		},
	});
	return mutation.mutate;
}
