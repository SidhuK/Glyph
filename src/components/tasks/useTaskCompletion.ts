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
	withoutTasks,
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
	const toggleTask = useToggleTask(spacePath, scope, {
		onSaved: ({ group }, etag) => dispatch({ type: "saved", notePath: group.note_path, etag }),
		onFailed: ({ group, item, checked }) => {
			if (checked) dispatch({ type: "drop", origin: taskKey(group.note_path, item.start) });
		},
	});

	const clearTimer = useCallback(() => {
		if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		timerRef.current = null;
	}, []);

	/** Drop held tasks from the list. Their checks are already written (or in flight). */
	const flush = async (keys: ReadonlySet<string>) => {
		timerRef.current = null;
		await queryClient.cancelQueries({ queryKey });
		if (queryClient.isMutating({ mutationKey: TOGGLE_TASK_MUTATION_KEY }) === 0) {
			// Every write has landed, so disk is the source of truth (and restores failures).
			await queryClient.refetchQueries({ queryKey });
		} else {
			queryClient.setQueryData<TaskNoteGroup[]>(queryKey, (current) =>
				current ? withoutTasks(current, keys) : current,
			);
		}
		dispatch({ type: "flush", keys });
	};

	/** (Re)start the single hold timer; each new check restarts it so a burst resolves together. */
	const scheduleFlush = (keys: ReadonlySet<string>) => {
		clearTimer();
		if (keys.size === 0) return;
		timerRef.current = window.setTimeout(() => void flush(keys), COMPLETE_HOLD_MS);
	};

	const complete = (group: TaskNoteGroup, item: TaskItem) => {
		const origin = taskKey(group.note_path, item.start);
		const tasks = taskSubtree(group, item.start).map((child) => ({ group, item: child, origin }));
		const keys = new Set(completing.entries.keys());
		for (const task of tasks) keys.add(taskKey(group.note_path, task.item.start));
		dispatch({ type: "complete", tasks, order: serverGroups.map((entry) => entry.note_path) });
		scheduleFlush(keys);
		toggleTask({ group, item, checked: true });
	};

	/** Undo during the hold: restore the checked task and the children it checked. */
	const cancel = (group: TaskNoteGroup, item: TaskItem) => {
		const origin = completing.entries.get(taskKey(group.note_path, item.start))?.origin;
		if (!origin) return;
		const restored = [...completing.entries.values()].filter((entry) => entry.origin === origin);
		dispatch({ type: "drop", origin });
		const remaining = new Set<string>();
		for (const [key, entry] of completing.entries) if (entry.origin !== origin) remaining.add(key);
		scheduleFlush(remaining);
		void queryClient.cancelQueries({ queryKey });
		queryClient.setQueryData<TaskNoteGroup[]>(queryKey, (current) =>
			current ? insertTasks(current, restored) : current,
		);
		for (const entry of restored) {
			toggleTask({ group: entry.group, item: entry.item, checked: false });
		}
	};

	/** Scope changes drop held tasks right away so they never show in another list. */
	const flushNow = () => {
		if (completing.entries.size === 0) return;
		clearTimer();
		void flush(new Set(completing.entries.keys()));
	};

	return { completing, complete, cancel, flushNow, clearTimer };
}
