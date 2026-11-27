import type { TaskPriority } from "@/lib/tauri";

type TaskPriorityLevel = "low" | "medium" | "high" | "urgent";

export const PRIORITY_MENU_VALUES = [
	null,
	1,
	2,
	3,
	4,
] as const satisfies readonly (TaskPriority | null)[];

export function priorityLevel(priority: TaskPriority | null): TaskPriorityLevel | null {
	switch (priority) {
		case null:
			return null;
		case 0:
		case 1:
			return "low";
		case 2:
			return "medium";
		case 3:
			return "high";
		case 4:
			return "urgent";
	}
}

export function priorityLabelKey(priority: TaskPriority | null) {
	const level = priorityLevel(priority);
	return level ? (`tasks.priority.${level}` as const) : ("tasks.priority.none" as const);
}

export function priorityFilterLabelKey(priority: TaskPriority) {
	return priority === 0 ? ("tasks.priority.lowest" as const) : priorityLabelKey(priority);
}
