import type { TaskRecord, TaskStatusKind } from "@/lib/tauri";

const TASK_STATUS_CHAR_RE = /^[^\]\n]$/u;

export const TASK_STATUS_KINDS = [
	"todo",
	"in_progress",
	"done",
	"cancelled",
] as const satisfies readonly TaskStatusKind[];

export const TASK_STATUS_CHAR = {
	todo: " ",
	in_progress: "/",
	done: "x",
	cancelled: "-",
} as const satisfies Record<TaskStatusKind, string>;

export function isDoneStatusChar(char: string): boolean {
	return char === "x" || char === "X";
}

export function taskStatusKindOf(char: string): TaskStatusKind {
	if (isDoneStatusChar(char)) return "done";
	return TASK_STATUS_KINDS.find((kind) => TASK_STATUS_CHAR[kind] === char) ?? "todo";
}

export function isTaskStatusChar(value: unknown): value is string {
	return typeof value === "string" && TASK_STATUS_CHAR_RE.test(value);
}

export function isOpenStatus(kind: TaskStatusKind): boolean {
	return kind === "todo" || kind === "in_progress";
}

export function circleToggleChar(record: TaskRecord): string {
	return isOpenStatus(record.status_kind) ? TASK_STATUS_CHAR.done : TASK_STATUS_CHAR.todo;
}
