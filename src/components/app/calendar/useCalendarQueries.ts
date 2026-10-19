import { type UseQueryResult, useQueries, useQuery } from "@tanstack/react-query";
import { type Day, endOfWeek, isSameMonth, startOfWeek } from "date-fns";
import { useMemo } from "react";
import { useSpace, useUILayoutContext } from "../../../contexts";
import {
	activityMapFromRows,
	calendarQueryKeys,
	loadCalendarActivity,
	loadCalendarNotesForDate,
	monthDateRange,
} from "../../../lib/calendarActivity";
import { extractErrorMessage } from "../../../lib/errorUtils";
import type { SidebarCalendarLayout } from "../../../lib/settings/model";
import type { CalendarDateNote, CalendarDayActivity } from "../../../lib/tauri";

const ACTIVITY_STALE_TIME_MS = 30_000;
const DAY_NOTES_STALE_TIME_MS = 15_000;

/** One row per note, daily notes first, then alphabetical by title. */
function dedupeNotes(notes: CalendarDateNote[]): CalendarDateNote[] {
	const byPath = new Map<string, CalendarDateNote>();
	for (const note of notes) {
		const existing = byPath.get(note.path);
		byPath.set(
			note.path,
			existing
				? {
						...existing,
						kinds: [...new Set([...existing.kinds, ...note.kinds])],
					}
				: note,
		);
	}
	return [...byPath.values()].sort((left, right) => {
		const leftDaily = left.kinds.includes("daily");
		const rightDaily = right.kinds.includes("daily");
		return (
			Number(rightDaily) - Number(leftDaily) ||
			left.title.toLowerCase().localeCompare(right.title.toLowerCase()) ||
			left.path.localeCompare(right.path)
		);
	});
}

function combineActivity(results: UseQueryResult<CalendarDayActivity[]>[]) {
	const error = results.find((result) => result.error)?.error;
	return {
		activityByDate: activityMapFromRows(results.flatMap((result) => result.data ?? [])),
		errorMessage: error ? extractErrorMessage(error) : null,
	};
}

/**
 * Daily-note and created/edited markers for the visible range, cached per calendar
 * month. A week strip that crosses a month boundary loads both months.
 */
export function useCalendarActivity(
	anchor: Date,
	layout: SidebarCalendarLayout,
	weekStartsOn: Day,
) {
	const { spacePath } = useSpace();
	const { dailyNotesFolder } = useUILayoutContext();
	const isWeek = layout === "week";
	const first = isWeek ? startOfWeek(anchor, { weekStartsOn }) : anchor;
	const last = isWeek ? endOfWeek(anchor, { weekStartsOn }) : anchor;
	const months = isSameMonth(first, last) ? [first] : [first, last];
	return useQueries({
		queries: months.map((month) => {
			const { fromDate, toDate } = monthDateRange(month);
			return {
				queryKey: calendarQueryKeys.activity(spacePath ?? "", fromDate, toDate, dailyNotesFolder),
				queryFn: () => loadCalendarActivity(month, dailyNotesFolder),
				enabled: spacePath !== null,
				staleTime: ACTIVITY_STALE_TIME_MS,
			};
		}),
		combine: combineActivity,
	});
}

/** Notes tied to `date` (yyyy-MM-dd), deduplicated with the daily note first. */
export function useCalendarDayNotes(date: string) {
	const { spacePath } = useSpace();
	const { dailyNotesFolder } = useUILayoutContext();
	const canQuery = spacePath !== null;
	const query = useQuery({
		queryKey: calendarQueryKeys.notesForDate(spacePath ?? "", date, dailyNotesFolder),
		queryFn: () => loadCalendarNotesForDate(date, dailyNotesFolder),
		enabled: canQuery,
		staleTime: DAY_NOTES_STALE_TIME_MS,
	});
	const notes = useMemo(() => dedupeNotes(query.data ?? []), [query.data]);
	return {
		notes,
		isPending: canQuery && query.isPending,
		errorMessage: query.error ? extractErrorMessage(query.error) : null,
	};
}
