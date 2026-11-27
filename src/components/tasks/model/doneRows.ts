import { startOfWeek, type Day, parseISO } from "date-fns";
import type { TFunction } from "i18next";
import { toIsoDate } from "@/lib/taskFields/naturalDate";
import type { TaskRecord } from "@/lib/tauri";
import { addIsoDays } from "./taskDates";
import { type TaskListRow, sectionRow, taskItemRows } from "./taskRows";
import { compareNoteOrder } from "./taskSort";

type DoneBucket = "today" | "yesterday" | "thisWeek" | "earlier";

const DONE_BUCKETS = [
	"today",
	"yesterday",
	"thisWeek",
	"earlier",
] as const satisfies readonly DoneBucket[];

interface DoneRowsInput {
	records: readonly TaskRecord[];
	today: string;
	weekStartsOn: Day;
	t: TFunction<"shell">;
}

function closedDate(record: TaskRecord): string | null {
	return record.completion ?? record.cancelled;
}

function bucketFor(date: string | null, today: string, weekStart: string): DoneBucket {
	if (date === null || date > today) return "earlier";
	if (date === today) return "today";
	if (date === addIsoDays(today, -1)) return "yesterday";
	return date >= weekStart ? "thisWeek" : "earlier";
}

function compareClosedDesc(left: TaskRecord, right: TaskRecord): number {
	const leftDate = closedDate(left);
	const rightDate = closedDate(right);
	if (leftDate !== rightDate) {
		if (leftDate === null) return 1;
		if (rightDate === null) return -1;
		return leftDate < rightDate ? 1 : -1;
	}
	if (leftDate === null)
		return right.note_updated_ms - left.note_updated_ms || compareNoteOrder(left, right);
	return compareNoteOrder(left, right);
}

export function buildDoneRows({ records, today, weekStartsOn, t }: DoneRowsInput): TaskListRow[] {
	const weekStart = toIsoDate(startOfWeek(parseISO(today), { weekStartsOn }));
	const buckets = new Map<DoneBucket, TaskRecord[]>();
	for (const record of records) {
		const bucket = bucketFor(closedDate(record), today, weekStart);
		buckets.set(bucket, [...(buckets.get(bucket) ?? []), record]);
	}
	const rows: TaskListRow[] = [];
	for (const bucket of DONE_BUCKETS) {
		const members = [...(buckets.get(bucket) ?? [])].sort(compareClosedDesc);
		if (members.length === 0) continue;
		rows.push(
			sectionRow({
				id: `section:done:${bucket}`,
				label: t(`tasks.doneSections.${bucket}`),
				count: members.length,
			}),
			...taskItemRows(members, { showNote: true, showDate: false, scope: bucket }),
		);
	}
	if (rows.length === 0) rows.push({ kind: "empty", id: "empty:done", variant: "done" });
	return rows;
}
