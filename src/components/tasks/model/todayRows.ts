import type { TFunction } from "i18next";
import type { TaskRecord } from "@/lib/tauri";
import { type TaskListRow, sectionRow, taskItemRows } from "./taskRows";
import { compareByPriority, compareDueAsc, sortedBy } from "./taskSort";
import { isOpenStatus } from "@/lib/taskFields/taskStatus";

export const TODAY_ADD_ROW_ID = "add:today";

interface TodayRowsInput {
	records: readonly TaskRecord[];
	today: string;
	completedExpanded: boolean;
	t: TFunction<"shell">;
}

export function buildTodayRows({
	records,
	today,
	completedExpanded,
	t,
}: TodayRowsInput): TaskListRow[] {
	const open = records.filter((record) => isOpenStatus(record.status_kind) && record.due !== null);
	const overdue = sortedBy(
		open.filter((record) => record.due !== null && record.due < today),
		compareDueAsc,
	);
	const dueToday = sortedBy(
		open.filter((record) => record.due === today),
		compareByPriority,
	);
	const completed = records.filter(
		(record) => record.status_kind === "done" && record.completion === today,
	);
	const rows: TaskListRow[] = [
		{ kind: "add", id: TODAY_ADD_ROW_ID, due: today, label: t("tasks.addToToday") },
	];
	if (overdue.length > 0) {
		rows.push(
			sectionRow({
				id: "section:overdue",
				label: t("tasks.sections.overdue"),
				count: overdue.length,
				tone: "danger",
				reschedule: overdue,
			}),
			...taskItemRows(overdue, { showNote: true, showDate: true, scope: "overdue" }),
		);
	}
	if (dueToday.length > 0) {
		rows.push(
			sectionRow({ id: "section:today", label: t("tasks.sections.today"), count: dueToday.length }),
			...taskItemRows(dueToday, { showNote: true, showDate: false, scope: "today" }),
		);
	}
	if (overdue.length === 0 && dueToday.length === 0) {
		rows.push({ kind: "empty", id: "empty:today", variant: "today" });
	}
	if (completed.length > 0) {
		rows.push({
			kind: "footer",
			id: "footer:completed",
			count: completed.length,
			expanded: completedExpanded,
		});
		if (completedExpanded) {
			rows.push(
				...taskItemRows(completed, { showNote: true, showDate: false, scope: "completed" }),
			);
		}
	}
	return rows;
}
