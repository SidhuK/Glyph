import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useReducer, useRef } from "react";
import { navigationQueryKeys } from "../../lib/navigationPrefetch";
import type { TaskItem, TaskNoteGroup, TaskScope } from "../../lib/tauri";
import {
	completionReducer,
	EMPTY_COMPLETING,
	insertTasks,
	taskKey,
	taskSubtree,
} from "./taskModel";
import { TOGGLE_TASK_MUTATION_KEY, useToggleTask } from "./useToggleTask";

/**
 * How long a checked task stays in place (struck through) before it leaves the list.
 * It gives time to undo a misclick and lets a burst of checks resolve together, so
 * rows never shift under the cursor between clicks.
 */
const COMPLETE_HOLD_MS = 900;

export function useTaskCompletion(
	spacePath: string | null,
	scope: TaskScope,
	serverGroups: readonly TaskNoteGroup[],
) {
	const queryClient = useQueryClient();
	const queryKey = navigationQueryKeys.tasks(scope);
	const [completing, dispatch] = useReducer(completionReducer, EMPTY_COMPLETING);
	const timerRef = useRef<number | null>(null);
	const toggleTask = useToggleTask(scope, {
		onSaved: ({ group }, etag) => dispatch({ type: "saved", notePath: group.note_path, etag }),
		onFailed: ({ group, item, checked }) => {
			if (checked) dispatch({ type: "drop", origin: taskKey(group.note_path, item.start) });
		},
	});

	const clearTimer = useCallback(() => {
		if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		timerRef.current = null;
	}, []);

	/**
	 * End the hold. While a toggle write is still running the hold restarts; once every
	 * write has landed, disk is the truth, so refetch and release every held task.
	 */
	const flush = async () => {
		if (queryClient.isMutating({ mutationKey: TOGGLE_TASK_MUTATION_KEY }) > 0) {
			scheduleFlush();
			return;
		}
		timerRef.current = null;
		await queryClient.cancelQueries({ queryKey });
		await queryClient.refetchQueries({ queryKey });
		dispatch({ type: "flush" });
	};

	/** (Re)start the single hold timer; each new check restarts it so a burst resolves together. */
	const scheduleFlush = () => {
		clearTimer();
		timerRef.current = window.setTimeout(() => void flush(), COMPLETE_HOLD_MS);
	};

	const complete = (group: TaskNoteGroup, item: TaskItem) => {
		if (!spacePath) return;
		const origin = taskKey(group.note_path, item.start);
		const tasks = taskSubtree(group, item.start).map((child) => ({ group, item: child, origin }));
		dispatch({ type: "complete", tasks, order: serverGroups.map((entry) => entry.note_path) });
		scheduleFlush();
		toggleTask({ spacePath, group, item, checked: true });
	};

	/** Undo during the hold: restore the checked task and the children it checked. */
	const cancel = (group: TaskNoteGroup, item: TaskItem) => {
		const origin = completing.entries.get(taskKey(group.note_path, item.start))?.origin;
		if (!origin || !spacePath) return;
		const restored = [...completing.entries.values()].filter((entry) => entry.origin === origin);
		dispatch({ type: "drop", origin });
		if (restored.length === completing.entries.size) clearTimer();
		else scheduleFlush();
		void queryClient.cancelQueries({ queryKey });
		queryClient.setQueryData<TaskNoteGroup[]>(queryKey, (current) =>
			current ? insertTasks(current, restored) : current,
		);
		for (const entry of restored) {
			toggleTask({ spacePath, group: entry.group, item: entry.item, checked: false });
		}
	};

	/** Scope changes release held tasks synchronously so they never merge into another list. */
	const flushNow = () => {
		if (completing.entries.size === 0) return;
		clearTimer();
		dispatch({ type: "flush" });
		void queryClient.invalidateQueries({ queryKey });
	};

	return { completing, complete, cancel, flushNow, clearTimer };
}
