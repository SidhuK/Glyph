import type { TaskPriority, TaskRecord, TaskStatusKind } from "@/lib/tauri";
import { taskKey } from "./taskIdentity";

export type TaskSectionIcon =
	| { kind: "status"; status: TaskStatusKind }
	| { kind: "priority"; priority: TaskPriority | null }
	| { kind: "note" }
	| { kind: "tag" }
	| { kind: "due" };

export type TaskEmptyVariant = "today" | "none" | "filtered" | "done";

export interface TaskSectionRow {
	kind: "section";
	id: string;
	label: string;
	detail: string | null;
	count: number | null;
	tone: "default" | "danger";
	icon: TaskSectionIcon | null;
	reschedule: readonly TaskRecord[] | null;
}

export interface TaskItemRow {
	kind: "task";
	id: string;
	record: TaskRecord;
	depth: number;
	showNote: boolean;
	showDate: boolean;
	subtasksInline: boolean;
}

export interface TaskAddRow {
	kind: "add";
	id: string;
	due: string | null;
	label: string;
}

export interface TaskFooterRow {
	kind: "footer";
	id: string;
	count: number;
	expanded: boolean;
}

interface TaskEmptyRow {
	kind: "empty";
	id: string;
	variant: TaskEmptyVariant;
}

export type TaskListRow = TaskSectionRow | TaskItemRow | TaskAddRow | TaskFooterRow | TaskEmptyRow;

export function sectionRow(
	section: Omit<TaskSectionRow, "kind" | "detail" | "tone" | "icon" | "reschedule"> &
		Partial<Pick<TaskSectionRow, "detail" | "tone" | "icon" | "reschedule">>,
): TaskSectionRow {
	return {
		kind: "section",
		detail: null,
		tone: "default",
		icon: null,
		reschedule: null,
		...section,
	};
}

export function taskItemRows(
	records: readonly TaskRecord[],
	options: { showNote: boolean; showDate: boolean; scope: string },
): TaskItemRow[] {
	return records.map((record) => ({
		kind: "task",
		id: `task:${options.scope}:${taskKey(record)}`,
		record,
		depth: 0,
		showNote: options.showNote,
		showDate: options.showDate,
		subtasksInline: false,
	}));
}
