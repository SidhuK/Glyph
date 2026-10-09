import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { navigationQueryKeys } from "../../lib/navigationPrefetch";
import { invoke, type TaskItem, type TaskNoteGroup, type TaskScope } from "../../lib/tauri";
import { toast } from "../../lib/toast";

export const TOGGLE_TASK_MUTATION_KEY = ["tasks", "toggle"] as const;

/** One id for every toggle failure, so a failed burst shows a single toast. */
const TOGGLE_ERROR_TOAST_ID = "tasks-toggle-error";

interface ToggleTaskVariables {
	/** Snapshot at click time, so a write never lands in a space switched to meanwhile. */
	spacePath: string;
	group: TaskNoteGroup;
	/** All in `group`'s note; written in one request. */
	items: TaskItem[];
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
 * One request per call. All toggles share one mutation scope, so they run one after
 * another and each sends the etag the previous write left in the cache; Rust also
 * verifies each target's text, so a stale offset can't flip a different task.
 */
export function useToggleTask(scope: TaskScope, { onSaved, onFailed }: ToggleTaskCallbacks) {
	const { t } = useTranslation("shell");
	const queryClient = useQueryClient();
	// Keyed by the space captured at click time, so a late result lands in that space's list.
	const listKey = ({ spacePath }: ToggleTaskVariables) =>
		navigationQueryKeys.tasks(spacePath, scope);

	const currentEtag = (variables: ToggleTaskVariables) =>
		queryClient
			.getQueryData<TaskNoteGroup[]>(listKey(variables))
			?.find((entry) => entry.note_path === variables.group.note_path)?.etag ??
		variables.group.etag;

	const mutation = useMutation({
		mutationKey: TOGGLE_TASK_MUTATION_KEY,
		scope: { id: "tasks-toggle" },
		mutationFn: (variables: ToggleTaskVariables) => {
			return invoke("tasks_toggle", {
				request: {
					space_path: variables.spacePath,
					note_path: variables.group.note_path,
					etag: currentEtag(variables),
					checked: variables.checked,
					items: variables.items.map(({ start, text }) => ({ start, text })),
				},
			});
		},
		onSuccess: (outcome, variables) => {
			if (outcome.kind === "index_failed") toast.warning(t("tasks.indexFailed"));
			queryClient.setQueryData<TaskNoteGroup[]>(listKey(variables), (current) =>
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
		onSettled: (_outcome, _error, variables) => {
			// Refetch only after the last in-flight toggle, so an earlier refetch cannot
			// bring back a row whose write is still pending.
			if (queryClient.isMutating({ mutationKey: TOGGLE_TASK_MUTATION_KEY }) !== 1) return;
			void queryClient.invalidateQueries({ queryKey: listKey(variables) });
		},
	});
	return mutation.mutate;
}
