import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useReducer, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSpace } from "@/contexts";
import { extractErrorMessage } from "@/lib/errorUtils";
import type { TaskFieldEdits, TaskRecord } from "@/lib/tauri";
import { toast } from "@/lib/toast";
import { descendantsOf, taskKey } from "../model/taskIdentity";
import { TASK_STATUS_CHAR, isOpenStatus } from "@/lib/taskFields/taskStatus";
import { NO_HELD_TASKS, heldTasksReducer } from "./heldTasks";
import { noteTasksQueryOptions } from "./taskQueries";
import type { TaskWriteIntent } from "./useTaskWrites";
import { useUndoNotice } from "./useUndoNotice";

const COMPLETION_HOLD_MS = 1500;
const COMPLETION_COLLAPSE_MS = 180;

interface UseTaskCompletionOptions {
	today: string;
	writeTasks: (intents: readonly TaskWriteIntent[]) => Promise<boolean>;
}

function closureFields(record: TaskRecord): TaskFieldEdits {
	return {
		...(record.invalid.includes("completion") ? {} : { completion: record.completion }),
		...(record.invalid.includes("cancelled") ? {} : { cancelled: record.cancelled }),
	};
}

function restoreIntents(
	original: TaskRecord,
	descendants: readonly TaskRecord[],
): TaskWriteIntent[] {
	return [original, ...descendants].map((record) => ({
		record,
		change: { status: record.status, fields: closureFields(record) },
	}));
}

export function useTaskCompletion({ today, writeTasks }: UseTaskCompletionOptions) {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const queryClient = useQueryClient();
	const [held, dispatch] = useReducer(heldTasksReducer, NO_HELD_TASKS);
	const timersRef = useRef(new Map<string, number[]>());
	const descendantsRef = useRef(new Map<string, TaskRecord[]>());
	const unwrittenRef = useRef(new Set<string>());
	const undoNotice = useUndoNotice();
	const { clearTimer: clearUndoTimer } = undoNotice;

	const clearTimers = (key: string) => {
		for (const timer of timersRef.current.get(key) ?? []) window.clearTimeout(timer);
		timersRef.current.delete(key);
	};

	const clearHoldTimers = useCallback(() => {
		for (const timers of timersRef.current.values()) {
			for (const timer of timers) window.clearTimeout(timer);
		}
		timersRef.current.clear();
	}, []);

	const clearAllTimers = useCallback(() => {
		clearHoldTimers();
		clearUndoTimer();
	}, [clearHoldTimers, clearUndoTimer]);

	const restore = (original: TaskRecord, descendants: readonly TaskRecord[]) =>
		void writeTasks(restoreIntents(original, descendants));

	const undoIntents = (key: string, original: TaskRecord): TaskWriteIntent[] => {
		if (unwrittenRef.current.delete(key)) return [];
		return restoreIntents(original, descendantsRef.current.get(key) ?? []);
	};

	const undoChange = (key: string, original: TaskRecord) =>
		void writeTasks(undoIntents(key, original));

	const showUndoToast = (original: TaskRecord, key: string, nextStatus: string) =>
		undoNotice.show({
			kind: nextStatus === TASK_STATUS_CHAR.done ? "completed" : "updated",
			undo: () => undoChange(key, original),
		});

	const openDescendants = async (record: TaskRecord, nextStatus: string): Promise<TaskRecord[]> => {
		const completesChildren = nextStatus === TASK_STATUS_CHAR.done && record.subtask_total > 0;
		if (!completesChildren || !spacePath) return [];
		const noteTasks = await queryClient.fetchQuery(
			noteTasksQueryOptions(spacePath, [record.note_path], today),
		);
		return descendantsOf(noteTasks, record).filter((child) => isOpenStatus(child.status_kind));
	};

	const release = (key: string) => {
		clearTimers(key);
		unwrittenRef.current.delete(key);
		dispatch({ type: "release", key });
	};

	const undoHeld = (key: string, original: TaskRecord) => {
		const written = !unwrittenRef.current.has(key);
		release(key);
		if (written) restore(original, descendantsRef.current.get(key) ?? []);
	};

	const scheduleLeave = (record: TaskRecord, key: string, nextStatus: string) => {
		timersRef.current.set(key, [
			window.setTimeout(() => dispatch({ type: "leave", key }), COMPLETION_HOLD_MS),
			window.setTimeout(() => {
				timersRef.current.delete(key);
				dispatch({ type: "release", key });
				showUndoToast(record, key, nextStatus);
			}, COMPLETION_HOLD_MS + COMPLETION_COLLAPSE_MS),
		]);
	};

	const changeWithHold = async (record: TaskRecord, nextStatus: string) => {
		const key = taskKey(record);
		const current = held.get(key);
		if (current) {
			undoHeld(key, current.original);
			return;
		}
		dispatch({ type: "hold", task: { key, original: record, nextStatus, leaving: false } });
		unwrittenRef.current.add(key);
		scheduleLeave(record, key, nextStatus);
		try {
			descendantsRef.current.set(key, await openDescendants(record, nextStatus));
		} catch (error) {
			release(key);
			toast.error(t("tasks.writeFailed"), { description: extractErrorMessage(error) });
			return;
		}
		if (!unwrittenRef.current.delete(key)) return;
		const saved = await writeTasks([{ record, change: { status: nextStatus } }]);
		if (!saved) release(key);
	};

	const flushHolds = () => {
		const flushed = [...held.values()];
		if (flushed.length === 0) return;
		clearHoldTimers();
		for (const task of flushed) dispatch({ type: "release", key: task.key });
		undoNotice.show({
			kind: flushed.every((task) => task.nextStatus === TASK_STATUS_CHAR.done)
				? "completed"
				: "updated",
			undo: () => {
				void writeTasks(flushed.flatMap((task) => undoIntents(task.key, task.original)));
			},
		});
	};

	return {
		held,
		changeWithHold,
		clearAllTimers,
		flushHolds,
		undoNotice: undoNotice.notice,
		dismissUndo: undoNotice.dismiss,
	};
}
