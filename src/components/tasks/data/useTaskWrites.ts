import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSpace } from "@/contexts";
import { extractErrorMessage } from "@/lib/errorUtils";
import { navigationQueryKeys } from "@/lib/navigationPrefetch";
import { invoke, type TaskEdit, type TaskFieldEdits, type TaskRecord } from "@/lib/tauri";
import { toast } from "@/lib/toast";
import { findSameTask } from "../model/taskIdentity";
import { noteTasksQueryOptions } from "./taskQueries";

interface TaskChange {
	status?: string;
	fields?: TaskFieldEdits;
	title?: string;
	skipSubtasks?: boolean;
}

export interface TaskWriteIntent {
	record: TaskRecord;
	change: TaskChange;
}

interface TaskWriteVariables {
	spacePath: string;
	today: string;
	intents: readonly TaskWriteIntent[];
}

type TaskWriteFailure = "conflict" | "missing";

class TaskWriteError extends Error {
	readonly failure: TaskWriteFailure;

	constructor(failure: TaskWriteFailure) {
		super(failure);
		this.failure = failure;
	}
}

const TASK_WRITE_ERROR_TOAST_ID = "tasks-write-error";
const TASK_WRITE_SCOPE = { id: "tasks-write" } as const;

function editFor(intent: TaskWriteIntent, target: TaskRecord): TaskEdit {
	return {
		note_path: target.note_path,
		etag: target.note_etag,
		start: target.start,
		text: target.text,
		...(intent.change.status !== undefined ? { set_status: intent.change.status } : {}),
		...(intent.change.fields !== undefined ? { set_fields: intent.change.fields } : {}),
		...(intent.change.title !== undefined ? { set_title: intent.change.title } : {}),
		...(intent.change.skipSubtasks ? { skip_subtasks: true } : {}),
	};
}

function failureKey(error: Error): string {
	if (error instanceof TaskWriteError) {
		return error.failure === "conflict" ? "tasks.conflictChanged" : "tasks.taskMissing";
	}
	return "tasks.writeFailed";
}

export function useTaskWrites(today: string) {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const queryClient = useQueryClient();

	const mutation = useMutation({
		scope: TASK_WRITE_SCOPE,
		mutationFn: async ({ spacePath: space, today: day, intents }: TaskWriteVariables) => {
			const fresh = await queryClient.fetchQuery({
				...noteTasksQueryOptions(
					space,
					intents.map((intent) => intent.record.note_path),
					day,
				),
				staleTime: 0,
			});
			const claimed = new Set<TaskRecord>();
			const edits = intents.map((intent) => {
				const target = findSameTask(fresh, intent.record, claimed);
				if (!target) throw new TaskWriteError("missing");
				claimed.add(target);
				return editFor(intent, target);
			});
			const results = await invoke("tasks_update_batch", {
				request: { space_path: space, today: day, edits },
			});
			if (results.some((result) => result.outcome.kind === "index_failed")) {
				toast.warning(t("tasks.indexFailed"), { description: t("tasks.indexFailedDetail") });
			}
			if (results.some((result) => result.outcome.kind === "conflict")) {
				throw new TaskWriteError("conflict");
			}
			for (const { outcome } of results) {
				if (outcome.kind === "failed") throw new Error(outcome.message);
			}
			return results;
		},
		onError: (error) => {
			const title = t(failureKey(error));
			const detail = error instanceof TaskWriteError ? null : extractErrorMessage(error);
			toast.error(title, {
				id: TASK_WRITE_ERROR_TOAST_ID,
				...(detail && detail !== title ? { description: detail } : {}),
			});
		},
		onSettled: (_data, _error, variables) =>
			queryClient.invalidateQueries({ queryKey: navigationQueryKeys.tasks(variables.spacePath) }),
	});

	const writeTasks = async (intents: readonly TaskWriteIntent[]): Promise<boolean> => {
		if (!spacePath || intents.length === 0) return false;
		try {
			await mutation.mutateAsync({ spacePath, today, intents });
			return true;
		} catch {
			return false;
		}
	};

	return { writeTasks };
}
