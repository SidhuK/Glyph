import type { TaskRecord } from "@/lib/tauri";
import { findSameTask, taskKey } from "../model/taskIdentity";

interface HeldTask {
	key: string;
	original: TaskRecord;
	nextStatus: string;
	leaving: boolean;
}

export type HeldTasks = ReadonlyMap<string, HeldTask>;

type HeldTaskAction =
	| { type: "hold"; task: HeldTask }
	| { type: "leave"; key: string }
	| { type: "release"; key: string };

export const NO_HELD_TASKS: HeldTasks = new Map();

export function heldTasksReducer(state: HeldTasks, action: HeldTaskAction): HeldTasks {
	const next = new Map(state);
	switch (action.type) {
		case "hold":
			next.set(action.task.key, action.task);
			return next;
		case "leave": {
			const task = next.get(action.key);
			if (task) next.set(action.key, { ...task, leaving: true });
			return next;
		}
		case "release":
			next.delete(action.key);
			return next;
	}
}

export function withHeldTasks(
	records: readonly TaskRecord[],
	held: HeldTasks,
): readonly TaskRecord[] {
	if (held.size === 0) return records;
	const replaced = new Set<TaskRecord>();
	for (const task of held.values()) {
		const fresh = findSameTask(records, task.original);
		if (fresh) replaced.add(fresh);
	}
	const heldKeys = new Set(held.keys());
	return [
		...records.filter((record) => !replaced.has(record) && !heldKeys.has(taskKey(record))),
		...[...held.values()].map((task) => task.original),
	];
}
