import type { TFunction } from "i18next";
import type { TaskRecord } from "@/lib/tauri";
import { groupTasks } from "./allGroups";
import type { TaskDisplayState, TaskOrderBy } from "./taskDisplay";
import { taskKey } from "./taskIdentity";
import { type TaskItemRow, type TaskListRow, sectionRow } from "./taskRows";
import { compareByPriority, compareDueAsc, compareTitle, sortedBy } from "./taskSort";

interface AllRowsInput {
	records: readonly TaskRecord[];
	display: TaskDisplayState;
	hasFilters: boolean;
	today: string;
	t: TFunction<"shell">;
}

const MAX_TASK_DEPTH = 4;

const ORDER_COMPARERS = {
	note: [],
	due: [compareDueAsc],
	priority: [compareByPriority],
	title: [compareTitle],
} as const satisfies Record<TaskOrderBy, readonly ((a: TaskRecord, b: TaskRecord) => number)[]>;

function parentKey(record: TaskRecord): string | null {
	return record.parent_start === null
		? null
		: taskKey({ note_path: record.note_path, start: record.parent_start });
}

export function visibleTasks(records: readonly TaskRecord[], showSubtasks: boolean): TaskRecord[] {
	if (showSubtasks) return [...records];
	const present = new Set(records.map(taskKey));
	return records.filter((record) => {
		const parent = parentKey(record);
		return parent === null || !present.has(parent);
	});
}

export function orderTasks(records: readonly TaskRecord[], orderBy: TaskOrderBy): TaskRecord[] {
	return sortedBy(records, ...ORDER_COMPARERS[orderBy]);
}

function nestedRows(
	members: readonly TaskRecord[],
	display: TaskDisplayState,
	scope: string,
): TaskItemRow[] {
	const ordered = orderTasks(members, display.orderBy);
	const keys = new Set(ordered.map(taskKey));
	const childrenOf = new Map<string, TaskRecord[]>();
	const roots: TaskRecord[] = [];
	for (const record of ordered) {
		const parent = parentKey(record);
		if (display.showSubtasks && parent !== null && keys.has(parent)) {
			childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), record]);
		} else {
			roots.push(record);
		}
	}
	const rows: TaskItemRow[] = [];
	const visit = (record: TaskRecord, depth: number) => {
		rows.push({
			kind: "task",
			id: `task:${scope}:${taskKey(record)}`,
			record,
			depth: Math.min(depth, MAX_TASK_DEPTH),
			showNote: display.groupBy !== "note",
			showDate: true,
			subtasksInline: display.showSubtasks,
		});
		const children = [...(childrenOf.get(taskKey(record)) ?? [])].sort((a, b) => a.start - b.start);
		for (const child of children) visit(child, depth + 1);
	};
	for (const root of roots) visit(root, 0);
	return rows;
}

export function buildAllRows({
	records,
	display,
	hasFilters,
	today,
	t,
}: AllRowsInput): TaskListRow[] {
	const shown = visibleTasks(records, display.showSubtasks);
	if (shown.length === 0) {
		return [{ kind: "empty", id: "empty:all", variant: hasFilters ? "filtered" : "none" }];
	}
	if (display.groupBy === "none") return nestedRows(shown, display, "all");
	return groupTasks(shown, display.groupBy, { today, t }).flatMap((group) => {
		const rows = nestedRows(group.members, display, group.id);
		return [
			sectionRow({
				id: `section:${group.id}`,
				label: group.label,
				detail: group.detail,
				count: rows.length,
				icon: group.icon,
			}),
			...rows,
		];
	});
}
