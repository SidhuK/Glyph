import { NoteIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	activityMapFromRows,
	calendarQueryKeys,
	dateHasNotes,
	loadCalendarActivity,
	loadCalendarNotesForDate,
	monthDateRange,
} from "../../lib/calendarActivity";
import { getTodayDateString } from "../../lib/dailyNotes";
import type { CalendarDateNote, CalendarDayActivity } from "../../lib/tauri";
import { cn } from "@/lib/utils";
import { Calendar } from "../ui/shadcn/calendar";
import { Dialog, DialogContent, DialogTitle } from "../ui/shadcn/dialog";

interface CalendarPaletteProps {
	open: boolean;
	onClose: () => void;
	spacePath: string | null;
	dailyNoteFolder: string | null;
	onOpenNote: (path: string) => void;
	onOpenDailyNoteAtDate: (date: string) => void;
}

const CALENDAR_DAY_CELL = "calendarPaletteDayCell";

function formatSelectedDateParts(date: string): {
	title: string;
	weekday: string;
} {
	const parsed = parseISO(date);
	return {
		title: format(parsed, "MMMM d"),
		weekday: format(parsed, "EEEE"),
	};
}

function NoteDayButton({
	day,
	modifiers,
	activityByDate,
	className,
	...props
}: {
	day: { date: Date; isoDate?: string };
	modifiers: {
		focused?: boolean;
		selected?: boolean;
		range_start?: boolean;
		range_end?: boolean;
		range_middle?: boolean;
		today?: boolean;
		outside?: boolean;
	};
	activityByDate: Map<string, CalendarDayActivity>;
	className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
	const dateKey = day.isoDate ?? format(day.date, "yyyy-MM-dd");
	const hasNote = dateHasNotes(activityByDate.get(dateKey));
	const ref = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (modifiers.focused) ref.current?.focus();
	}, [modifiers.focused]);

	const isSelected =
		modifiers.selected &&
		!modifiers.range_start &&
		!modifiers.range_end &&
		!modifiers.range_middle;

	return (
		<button
			ref={ref}
			type="button"
			data-selected={isSelected ? "true" : "false"}
			data-today={modifiers.today ? "true" : "false"}
			data-outside={modifiers.outside ? "true" : "false"}
			className={cn("calendarPaletteDayButton", className)}
			{...props}
		>
			{day.date.getDate()}
			<span
				className="calendarPaletteNoteDot"
				data-active={hasNote ? "true" : "false"}
				aria-hidden="true"
			/>
		</button>
	);
}

function CalendarCaptionButton({
	onGoToToday,
	className,
	children,
	style,
	role,
	"aria-live": ariaLive,
}: {
	onGoToToday: () => void;
	className?: string;
	children?: React.ReactNode;
	style?: React.CSSProperties;
	role?: React.AriaRole;
	"aria-live"?: "off" | "polite" | "assertive";
}) {
	return (
		<span className={className} aria-live={ariaLive} role={role} style={style}>
			<button
				type="button"
				className="calendarPaletteCaptionButton"
				onClick={onGoToToday}
				aria-label="Go to today"
			>
				{children}
			</button>
		</span>
	);
}

function dedupeNotesForList(notes: CalendarDateNote[]): CalendarDateNote[] {
	const byPath = new Map<string, CalendarDateNote>();
	for (const note of notes) {
		const existing = byPath.get(note.path);
		if (!existing) {
			byPath.set(note.path, note);
			continue;
		}
		const kinds = new Set([...existing.kinds, ...note.kinds]);
		byPath.set(note.path, { ...existing, kinds: [...kinds] });
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
		enabled: open && canQuery && selectedDate.length > 0,
		staleTime: 15_000,
	});

	const notesForList = useMemo(
		() => dedupeNotesForList(notesQuery.data ?? []),
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

	const selectedDateParts = useMemo(
		() => formatSelectedDateParts(selectedDate),
		[selectedDate],
	);

	const handleSelectDate = useCallback((date: Date | undefined) => {
		if (!date) return;
		setSelectedDate(format(date, "yyyy-MM-dd"));
	}, []);

	const handleGoToToday = useCallback(() => {
		const today = getTodayDateString();
		setVisibleMonth(parseISO(today));
		setSelectedDate(today);
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
				className="calendarPalette top-[46%] gap-0 border-none bg-transparent p-0 shadow-none sm:max-w-[400px]"
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">Calendar</DialogTitle>

				<Calendar
					mode="single"
					selected={selectedDateValue}
					onSelect={handleSelectDate}
					month={visibleMonth}
					onMonthChange={setVisibleMonth}
					showOutsideDays
					fixedWeeks
					className="calendarPaletteCalendar w-full bg-transparent p-0"
					classNames={{
						root: "w-full max-w-full",
						months: "calendarPaletteMonths",
						month: "calendarPaletteMonth",
						nav: "calendarPaletteNav",
						month_caption: "calendarPaletteMonthCaption",
						caption_label: "calendarPaletteCaptionLabel",
						button_previous: "calendarPaletteNavButton",
						button_next: "calendarPaletteNavButton",
						weekdays: "calendarPaletteWeekdays",
						weekday: "calendarPaletteWeekday",
						week: "calendarPaletteWeek",
						weeks: "calendarPaletteWeeks",
						month_grid: "calendarPaletteMonthGrid",
						day: CALENDAR_DAY_CELL,
						day_button: "calendarPaletteDayButton",
						today: CALENDAR_DAY_CELL,
						selected: CALENDAR_DAY_CELL,
						outside: CALENDAR_DAY_CELL,
						focused: CALENDAR_DAY_CELL,
					}}
					components={{
						CaptionLabel: ({ children, className, ...props }) => (
							<CalendarCaptionButton
								className={className}
								onGoToToday={handleGoToToday}
								{...props}
							>
								{children}
							</CalendarCaptionButton>
						),
						DayButton: ({ day, modifiers, ...props }) => (
							<NoteDayButton
								day={day}
								modifiers={modifiers}
								activityByDate={activityByDate}
								{...props}
							/>
						),
					}}
				/>

				<section className="calendarPaletteNotesPanel">
					<div className="calendarPaletteNotesHeader">
						<div className="calendarPaletteNotesHeading">
							<h3 className="calendarPaletteNotesTitle">
								{selectedDateParts.title}
							</h3>
							<p className="calendarPaletteNotesWeekday">
								{selectedDateParts.weekday}
							</p>
						</div>
						{dailyNoteFolder ? (
							<button
								type="button"
								className="calendarPaletteDailyNoteButton"
								onClick={handleOpenDailyNote}
							>
								Open daily note
							</button>
						) : null}
					</div>

					<div className="calendarPaletteNotesList">
						{notesQuery.isLoading ? (
							<p className="calendarPaletteNotesStatus">Loading notes…</p>
						) : notesForList.length > 0 ? (
							<ul className="calendarPaletteNotesItems">
								{notesForList.map((note) => (
									<li key={note.path}>
										<button
											type="button"
											className="calendarPaletteNoteItem"
											onClick={() => handleOpenNote(note.path)}
										>
											<span className="calendarPaletteNoteIcon">
												<HugeiconsIcon
													icon={NoteIcon}
													size="var(--icon-md)"
													strokeWidth={0.9}
												/>
											</span>
											<span className="calendarPaletteNoteCopy">
												<span className="calendarPaletteNoteTitle">
													{note.title}
												</span>
												<span className="calendarPaletteNotePath">
													{note.path}
												</span>
											</span>
										</button>
									</li>
								))}
							</ul>
						) : (
							<div className="calendarPaletteNotesEmpty">
								<span className="calendarPaletteNotesEmptyIcon" aria-hidden="true">
									<HugeiconsIcon
										icon={NoteIcon}
										size="var(--icon-xl)"
										strokeWidth={0.9}
									/>
								</span>
								<p className="calendarPaletteNotesEmptyTitle">No notes yet</p>
							</div>
						)}
					</div>
				</section>
			</DialogContent>
		</Dialog>
	);
}
