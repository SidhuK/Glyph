import {
	type Day,
	addDays,
	addMonths,
	addWeeks,
	differenceInCalendarDays,
	format,
	isValid,
	parseISO,
	startOfWeek,
} from "date-fns";
import { buildMonthWeeks } from "../../components/app/calendar/monthGrid";
import { parseIsoDate } from "../dailyNotes";
import type { DatabaseCellValue, DatabaseColumn, DatabaseDateRange, DatabaseRow } from "../tauri";
import { databaseCellValueFromRow } from "./config";

export type CalendarMode = "month" | "week";

export interface CalendarWindow {
	anchor: Date;
	mode: CalendarMode;
}

export interface CalendarEntry {
	row: DatabaseRow;
	/** True when the row started on an earlier day and continues into this one. */
	continued: boolean;
}

const DAYS_IN_WEEK = 7;

export function dateKey(date: Date): string {
	return format(date, "yyyy-MM-dd");
}

export function calendarWeeks(window: CalendarWindow, weekStartsOn: Day): Date[][] {
	if (window.mode === "month") return buildMonthWeeks(window.anchor, weekStartsOn);
	const first = startOfWeek(window.anchor, { weekStartsOn });
	return [Array.from({ length: DAYS_IN_WEEK }, (_, day) => addDays(first, day))];
}

export function calendarDateRange(weeks: Date[][]): DatabaseDateRange {
	const first = weeks[0]?.[0] ?? new Date();
	const lastWeek = weeks[weeks.length - 1] ?? [];
	const last = lastWeek[lastWeek.length - 1] ?? first;
	return { kind: "range", start: dateKey(first), end: dateKey(last) };
}

export function shiftCalendarWindow(window: CalendarWindow, delta: number): CalendarWindow {
	return {
		...window,
		anchor:
			window.mode === "month" ? addMonths(window.anchor, delta) : addWeeks(window.anchor, delta),
	};
}

export function calendarTitle(window: CalendarWindow, weeks: Date[][], locale: string): string {
	if (window.mode === "month") {
		return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
			window.anchor,
		);
	}
	const week = weeks[0] ?? [];
	const first = week[0] ?? window.anchor;
	const last = week[week.length - 1] ?? first;
	const formatter = new Intl.DateTimeFormat(locale, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
	return `${formatter.format(first)} – ${formatter.format(last)}`;
}

export function weekdayLabels(weeks: Date[][], locale: string): string[] {
	const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
	return (weeks[0] ?? []).map((day) => formatter.format(day));
}

/** Accepts the `YYYY-MM-DD` values the index stores and RFC 3339 datetimes. */
export function parseCellDate(value: string | null | undefined): Date | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	const isoDate = parseIsoDate(trimmed);
	if (isoDate) return isoDate;
	const parsed = parseISO(trimmed);
	if (!isValid(parsed)) return null;
	return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function rowSpan(
	row: DatabaseRow,
	startColumn: DatabaseColumn,
	endColumn: DatabaseColumn | null,
): { start: Date; days: number } | null {
	const start = parseCellDate(databaseCellValueFromRow(row, startColumn).value_text);
	if (!start) return null;
	const end = endColumn ? parseCellDate(databaseCellValueFromRow(row, endColumn).value_text) : null;
	const days = end ? differenceInCalendarDays(end, start) : 0;
	return { start, days: Math.max(days, 0) };
}

/** Rows keep the query's sort order inside each day; multi-day rows repeat per day. */
export function calendarEntriesByDay(
	rows: DatabaseRow[],
	weeks: Date[][],
	startColumn: DatabaseColumn,
	endColumn: DatabaseColumn | null,
): Map<string, CalendarEntry[]> {
	const byDay = new Map<string, CalendarEntry[]>();
	const first = weeks[0]?.[0];
	const lastWeek = weeks[weeks.length - 1];
	const last = lastWeek?.[lastWeek.length - 1];
	if (!first || !last) return byDay;
	for (const row of rows) {
		const span = rowSpan(row, startColumn, endColumn);
		if (!span) continue;
		// Only walk the days of a long span that fall inside the visible window.
		const from = Math.max(0, differenceInCalendarDays(first, span.start));
		const to = Math.min(span.days, differenceInCalendarDays(last, span.start));
		for (let offset = from; offset <= to; offset += 1) {
			const key = dateKey(addDays(span.start, offset));
			const entries = byDay.get(key) ?? [];
			entries.push({ row, continued: offset > 0 });
			byDay.set(key, entries);
		}
	}
	return byDay;
}

export function dateCellValue(date: Date): DatabaseCellValue {
	return { kind: "date", value_text: dateKey(date), value_list: [] };
}

/** Moving a ranged row shifts its end by the same number of days. */
export function rescheduleUpdates(
	row: DatabaseRow,
	target: Date,
	startColumn: DatabaseColumn,
	endColumn: DatabaseColumn | null,
): Array<{ column: DatabaseColumn; date: Date }> {
	const span = rowSpan(row, startColumn, endColumn);
	const updates = [{ column: startColumn, date: target }];
	if (span && endColumn && span.days > 0) {
		updates.push({ column: endColumn, date: addDays(target, span.days) });
	}
	return updates;
}
