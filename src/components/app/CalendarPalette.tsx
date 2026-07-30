import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	activityMapFromRows,
	calendarQueryKeys,
	loadCalendarActivity,
	loadCalendarNotesForDate,
	monthDateRange,
} from "../../lib/calendarActivity";
import { getTodayDateString } from "../../lib/dailyNotes";
import type { CalendarDateNote } from "../../lib/tauri";
import { Dialog, DialogContent, DialogTitle } from "../ui/shadcn/dialog";
import { CalendarMonth } from "./calendar/CalendarMonth";
import { DayNotesPanel } from "./calendar/DayNotesPanel";

interface CalendarPaletteProps {
	open: boolean;
	onClose: () => void;
	spacePath: string | null;
	dailyNoteFolder: string | null;
	onOpenNote: (path: string) => void;
	onOpenDailyNoteAtDate: (date: string) => void;
}

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

export function CalendarPalette({
	open,
	onClose,
	spacePath,
	dailyNoteFolder,
	onOpenNote,
	onOpenDailyNoteAtDate,
}: CalendarPaletteProps) {
	const { t, i18n } = useTranslation("shell");
	const [visibleMonth, setVisibleMonth] = useState(() => new Date());
	const [selectedDate, setSelectedDate] = useState(() => getTodayDateString());
	const canQuery = spacePath !== null;

	const monthRange = useMemo(
		() => monthDateRange(visibleMonth),
		[visibleMonth],
	);

	const activityQuery = useQuery({
		queryKey: calendarQueryKeys.activity(
			spacePath ?? "",
			monthRange.fromDate,
			monthRange.toDate,
			dailyNoteFolder,
		),
		queryFn: () => loadCalendarActivity(visibleMonth, dailyNoteFolder),
		enabled: open && canQuery,
		staleTime: 30_000,
	});

	const notesQuery = useQuery({
		queryKey: calendarQueryKeys.notesForDate(
			spacePath ?? "",
			selectedDate,
			dailyNoteFolder,
		),
		queryFn: () => loadCalendarNotesForDate(selectedDate, dailyNoteFolder),
		enabled: open && canQuery,
		staleTime: 15_000,
	});

	const notes = useMemo(
		() => dedupeNotes(notesQuery.data ?? []),
		[notesQuery.data],
	);
	const activityByDate = useMemo(
		() => activityMapFromRows(activityQuery.data ?? []),
		[activityQuery.data],
	);
	const selectedDateValue = useMemo(
		() => parseISO(selectedDate),
		[selectedDate],
	);
	// Recomputed each render so the today highlight survives a midnight rollover.
	const today = parseISO(getTodayDateString());

	const handleSelectDate = useCallback((date: Date) => {
		setSelectedDate(format(date, "yyyy-MM-dd"));
	}, []);

	const handleGoToToday = useCallback(() => {
		const todayKey = getTodayDateString();
		setVisibleMonth(parseISO(todayKey));
		setSelectedDate(todayKey);
	}, []);

	const handleOpenDailyNote = useCallback(() => {
		onClose();
		onOpenDailyNoteAtDate(selectedDate);
	}, [onClose, onOpenDailyNoteAtDate, selectedDate]);

	const handleOpenNote = useCallback(
		(path: string) => {
			onClose();
			onOpenNote(path);
		},
		[onClose, onOpenNote],
	);

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent
				className="calendarPalette top-[46%] gap-0 border-none bg-transparent p-0 shadow-none sm:max-w-[420px]"
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">{t("calendar.title")}</DialogTitle>

				<CalendarMonth
					month={visibleMonth}
					selected={selectedDateValue}
					today={today}
					activityByDate={activityByDate}
					locale={i18n.language}
					onMonthChange={setVisibleMonth}
					onSelect={handleSelectDate}
					onGoToToday={handleGoToToday}
				/>

				<DayNotesPanel
					selectedDate={selectedDateValue}
					locale={i18n.language}
					notes={notes}
					isLoading={notesQuery.isPending && canQuery}
					errorMessage={
						notesQuery.error instanceof Error
							? notesQuery.error.message
							: notesQuery.error
								? String(notesQuery.error)
								: null
					}
					canOpenDailyNote={Boolean(dailyNoteFolder)}
					onOpenDailyNote={handleOpenDailyNote}
					onOpenNote={handleOpenNote}
				/>
			</DialogContent>
		</Dialog>
	);
}
