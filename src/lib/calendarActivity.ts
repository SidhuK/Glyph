import { endOfMonth, format, startOfMonth } from "date-fns";
import { queryClient } from "./queryClient";
import type { CalendarDateNote, CalendarDayActivity } from "./tauri";
import { invoke } from "./tauri";

export const calendarQueryKeys = {
	all: ["calendar"] as const,
	activity: (
		spacePath: string,
		fromDate: string,
		toDate: string,
		dailyNoteFolder: string | null,
	) =>
		[
			...calendarQueryKeys.all,
			"activity",
			spacePath,
			fromDate,
			toDate,
			dailyNoteFolder ?? "__none__",
		] as const,
	notesForDate: (
		spacePath: string,
		date: string,
		dailyNoteFolder: string | null,
	) =>
		[
			...calendarQueryKeys.all,
			"notes",
			spacePath,
			date,
			dailyNoteFolder ?? "__none__",
		] as const,
};

export function monthDateRange(month: Date): {
	fromDate: string;
	toDate: string;
} {
	return {
		fromDate: format(startOfMonth(month), "yyyy-MM-dd"),
		toDate: format(endOfMonth(month), "yyyy-MM-dd"),
	};
}

/** Marker strength for a day cell: a daily note outranks incidental activity. */
export type CalendarDayTone = "daily" | "note" | null;

export function activityTone(
	activity: CalendarDayActivity | undefined,
): CalendarDayTone {
	if (!activity) return null;
	if (activity.hasDailyNote) return "daily";
	return activity.hasCreated || activity.hasEdited ? "note" : null;
}

export function activityMapFromRows(
	rows: CalendarDayActivity[],
): Map<string, CalendarDayActivity> {
	return new Map(rows.map((row) => [row.date, row]));
}

export async function loadCalendarActivity(
	month: Date,
	dailyNoteFolder: string | null,
): Promise<CalendarDayActivity[]> {
	const { fromDate, toDate } = monthDateRange(month);
	return invoke("index_calendar_activity", {
		from_date: fromDate,
		to_date: toDate,
		daily_note_folder: dailyNoteFolder,
	});
}

export async function loadCalendarNotesForDate(
	date: string,
	dailyNoteFolder: string | null,
): Promise<CalendarDateNote[]> {
	return invoke("index_calendar_notes_for_date", {
		date,
		daily_note_folder: dailyNoteFolder,
	});
}

export function invalidateCalendarPrefetch(): void {
	void queryClient.invalidateQueries({ queryKey: calendarQueryKeys.all });
}
