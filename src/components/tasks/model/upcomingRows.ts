import type { TFunction } from "i18next";
import type { DateDisplayFormat } from "@/lib/dateDisplayFormat";
import type { TaskRecord } from "@/lib/tauri";
import {
	addIsoDays,
	compactAbsoluteDate,
	daysFromToday,
	monthHeading,
	weekdayName,
} from "./taskDates";
import { type TaskListRow, sectionRow, taskItemRows } from "./taskRows";
import { compareByPriority, compareDueAsc, sortedBy } from "./taskSort";
import { isOpenStatus } from "@/lib/taskFields/taskStatus";

interface UpcomingRowsInput {
	records: readonly TaskRecord[];
	today: string;
	lastDay: string;
	locale: string;
	dateFormat: DateDisplayFormat;
	t: TFunction<"shell">;
}

interface UpcomingRows {
	rows: TaskListRow[];
	dayRowIndex: ReadonlyMap<string, number>;
}

function dayLabel(isoDate: string, today: string, locale: string, t: TFunction<"shell">): string {
	const days = daysFromToday(isoDate, today);
	if (days === 0) return t("tasks.date.today");
	if (days === 1) return t("tasks.date.tomorrow");
	return weekdayName(isoDate, locale, "long");
}

function daysThrough(today: string, lastDay: string): string[] {
	const count = Math.max(0, daysFromToday(lastDay, today)) + 1;
	return Array.from({ length: count }, (_, index) => addIsoDays(today, index));
}

function monthGroups(records: readonly TaskRecord[]): Map<string, TaskRecord[]> {
	const groups = new Map<string, TaskRecord[]>();
	for (const record of sortedBy(records, compareDueAsc, compareByPriority)) {
		const month = record.due?.slice(0, 7) ?? "";
		groups.set(month, [...(groups.get(month) ?? []), record]);
	}
	return groups;
}

export function buildUpcomingRows(input: UpcomingRowsInput): UpcomingRows {
	const { records, today, lastDay, locale, dateFormat, t } = input;
	const dated = records.filter((record) => isOpenStatus(record.status_kind) && record.due !== null);
	const overdue = sortedBy(
		dated.filter((record) => record.due !== null && record.due < today),
		compareDueAsc,
	);
	const rows: TaskListRow[] = [];
	const dayRowIndex = new Map<string, number>();
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
	for (const day of daysThrough(today, lastDay)) {
		const dayTasks = sortedBy(
			dated.filter((record) => record.due === day),
			compareByPriority,
		);
		dayRowIndex.set(day, rows.length);
		rows.push(
			sectionRow({
				id: `section:day:${day}`,
				label: dayLabel(day, today, locale, t),
				detail: compactAbsoluteDate(day, dateFormat, locale),
				count: null,
			}),
			...taskItemRows(dayTasks, { showNote: true, showDate: false, scope: day }),
			{ kind: "add", id: `add:${day}`, due: day, label: t("tasks.addTask") },
		);
	}
	const later = dated.filter((record) => record.due !== null && record.due > lastDay);
	for (const [month, monthTasks] of monthGroups(later)) {
		rows.push(
			sectionRow({
				id: `section:month:${month}`,
				label: monthHeading(`${month}-01`, locale),
				count: monthTasks.length,
			}),
			...taskItemRows(monthTasks, { showNote: true, showDate: true, scope: month }),
		);
	}
	return { rows, dayRowIndex };
}
