import type { TaskPriority } from "@/lib/tauri";

const TASK_PRIORITY_NAMES = ["lowest", "low", "medium", "high", "highest"] as const;

type TaskPriorityName = (typeof TASK_PRIORITY_NAMES)[number];

export const TASK_PRIORITIES = [4, 3, 2, 1, 0] as const satisfies readonly TaskPriority[];

export function taskPriorityName(priority: TaskPriority): TaskPriorityName {
	return TASK_PRIORITY_NAMES[priority];
}

export function taskPriorityFromName(name: string): TaskPriority | null {
	const index = TASK_PRIORITY_NAMES.findIndex(
		(candidate) => candidate === name.trim().toLowerCase(),
	);
	return isTaskPriority(index) ? index : null;
}

export function isTaskPriority(value: unknown): value is TaskPriority {
	return value === 0 || value === 1 || value === 2 || value === 3 || value === 4;
}
