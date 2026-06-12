import {
	AlertCircleIcon,
	ArrowLeftBigIcon,
	ArrowRightBigIcon,
	Calendar03Icon,
	CalendarAdd01Icon,
	CheckListIcon,
	MoreHorizontalIcon,
	NoteIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import {
	useFileTreeContext,
	useSpace,
	useUILayoutContext,
} from "../../contexts";
import { useDailyNote } from "../../hooks/useDailyNote";
import {
	buildWeekRange,
	parseCalendarDate,
	shiftWeek,
} from "../../lib/calendar";
import { showNativePopupMenu } from "../../lib/nativeContextMenu";
import {
	loadCalendarData,
	navigationQueryKeys,
	prefetchNote,
} from "../../lib/navigationPrefetch";
import {
	DEFAULT_TAG_ICON_NAME,
	resolveTagIconName,
	tagIconOverridesFromAppearance,
} from "../../lib/tagIcons";
import { todayIsoDateLocal } from "../../lib/tasks";
import type {
	CalendarNoteActivityItem,
	CalendarRangeResponse,
} from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { DatabaseColumnIcon } from "../database/DatabaseColumnIcon";
import { Button } from "../ui/shadcn/button";

const ANCHOR_STORAGE_KEY = "glyph.calendar.anchorDate";
const SELECTED_STORAGE_KEY = "glyph.calendar.selectedDate";

interface CalendarPaneProps {
	initialData?: CalendarRangeResponse | null;
	onOpenFile: (relPath: string) => Promise<void>;
	onOpenDailyNotesSettings: () => void;
}

function readStorage(key: string): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStorage(key: string, value: string) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(key, value);
	} catch {
		// Best-effort persistence.
	}
}

function isDateInsideWeek(date: string, anchorDate: string): boolean {
	return buildWeekRange(anchorDate).dates.includes(date);
}

function fileTitleFromPath(notePath: string): string {
	const base = notePath.split("/").pop() ?? notePath;
	return base.replace(/\.md$/i, "");
}

function noteTitle(note: CalendarNoteActivityItem): string {
	const title = note.title.trim();
	return title || fileTitleFromPath(note.note_path);
}

function noteTimeLabel(note: CalendarNoteActivityItem): string {
	const source = note.edited_on_day ? note.updated : note.created;
	const date = new Date(source);
	if (Number.isNaN(date.getTime())) {
		return note.edited_on_day ? "edited" : "created";
	}
	return format(date, "h:mm a");
}

function weekTitle(dates: string[]): string {
	const first = parseCalendarDate(dates[0] ?? todayIsoDateLocal());
	const last = parseCalendarDate(dates[dates.length - 1] ?? dates[0]);
	if (first.getFullYear() !== last.getFullYear()) {
		return `${format(first, "MMM d, yyyy")} - ${format(last, "MMM d, yyyy")}`;
	}
	if (first.getMonth() !== last.getMonth()) {
		return `${format(first, "MMM d")} - ${format(last, "MMM d, yyyy")}`;
	}
	return `${format(first, "MMM d")} - ${format(last, "d, yyyy")}`;
}

export function CalendarPane({
	initialData = null,
	onOpenFile,
	onOpenDailyNotesSettings,
}: CalendarPaneProps) {
	const { beautifulTags, tagAppearance } = useFileTreeContext();
	const today = useMemo(() => todayIsoDateLocal(), []);
	const initialSelectedDate = useMemo(
		() => readStorage(SELECTED_STORAGE_KEY) ?? todayIsoDateLocal(),
		[],
	);
	const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
	const [anchorDate, setAnchorDate] = useState(
		() => readStorage(ANCHOR_STORAGE_KEY) ?? initialSelectedDate,
	);
	const tagIconOverrides = useMemo(
		() => tagIconOverridesFromAppearance(tagAppearance),
		[tagAppearance],
	);
	const iconNameForTag = useCallback(
		(tag: string) =>
			beautifulTags
				? resolveTagIconName(tag, tagIconOverrides, beautifulTags)
				: DEFAULT_TAG_ICON_NAME,
		[beautifulTags, tagIconOverrides],
	);
	const normalizedAnchorDate = isDateInsideWeek(selectedDate, anchorDate)
		? anchorDate
		: selectedDate;
	const weekRange = useMemo(
		() => buildWeekRange(normalizedAnchorDate),
		[normalizedAnchorDate],
	);
	const [error, setError] = useState("");
	const queryClient = useQueryClient();
	const { dailyNotesFolder, dailyNoteTemplatePath } = useUILayoutContext();
	const { spacePath } = useSpace();
	const { openOrCreateDailyNoteAtDate } = useDailyNote({
		onOpenFile,
		setError,
		spacePath,
		templatePath: dailyNoteTemplatePath,
	});

	const calendarArgs = useMemo(
		() => ({
			anchorDate: normalizedAnchorDate,
			selectedDate,
			dailyNotesFolder,
		}),
		[dailyNotesFolder, normalizedAnchorDate, selectedDate],
	);
	const matchingInitialData = useMemo(() => {
		if (!initialData || initialData.detail.selected_date !== selectedDate) {
			return undefined;
		}
		const lastDay = initialData.days[initialData.days.length - 1];
		if (
			initialData.days.length !== weekRange.dates.length ||
			initialData.days[0]?.date !== weekRange.start ||
			lastDay?.date !== weekRange.end
		) {
			return undefined;
		}
		return initialData;
	}, [initialData, selectedDate, weekRange]);
	const calendarQuery = useQuery({
		queryKey: navigationQueryKeys.calendarRange(calendarArgs),
		queryFn: () => loadCalendarData(calendarArgs),
		initialData: matchingInitialData,
	});
	const data = calendarQuery.data ?? null;

	const invalidateCalendar = useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.calendar(),
		});
		await queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.taskSummaries(),
		});
		await queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.allDocs(),
		});
	}, [queryClient]);

	const setAnchorDateAndPersist = useCallback((nextDate: string) => {
		writeStorage(ANCHOR_STORAGE_KEY, nextDate);
		setAnchorDate(nextDate);
	}, []);

	const setSelectedDateAndPersist = useCallback((nextDate: string) => {
		writeStorage(SELECTED_STORAGE_KEY, nextDate);
		setSelectedDate(nextDate);
	}, []);

	useTauriEvent("notes:external_changed", () => {
		void invalidateCalendar();
	});

	const goToToday = useCallback(() => {
		setAnchorDateAndPersist(today);
		setSelectedDateAndPersist(today);
	}, [setAnchorDateAndPersist, setSelectedDateAndPersist, today]);

	const selectDay = useCallback(
		(date: string) => {
			setSelectedDateAndPersist(date);
			if (!isDateInsideWeek(date, normalizedAnchorDate)) {
				setAnchorDateAndPersist(date);
			}
		},
		[normalizedAnchorDate, setAnchorDateAndPersist, setSelectedDateAndPersist],
	);

	const stepWeek = useCallback(
		(direction: -1 | 1) => {
			const nextSelected = shiftWeek(selectedDate, direction);
			setAnchorDateAndPersist(nextSelected);
			setSelectedDateAndPersist(nextSelected);
		},
		[selectedDate, setAnchorDateAndPersist, setSelectedDateAndPersist],
	);

	const openDailyNoteForDate = useCallback(
		async (date: string) => {
			if (!dailyNotesFolder) {
				onOpenDailyNotesSettings();
				return;
			}
			await openOrCreateDailyNoteAtDate(dailyNotesFolder, date);
			await invalidateCalendar();
		},
		[
			dailyNotesFolder,
			invalidateCalendar,
			onOpenDailyNotesSettings,
			openOrCreateDailyNoteAtDate,
		],
	);

	const openSelectedDailyNote = useCallback(async () => {
		await openDailyNoteForDate(selectedDate);
	}, [openDailyNoteForDate, selectedDate]);

	const openNativeMenu = useCallback(
		async (event: React.MouseEvent<HTMLButtonElement>) => {
			await showNativePopupMenu(event, [
				{
					label: "Open daily note",
					action: () => void openSelectedDailyNote(),
				},
				{ label: "Today", action: goToToday },
				{ type: "separator" },
				{ label: "Previous week", action: () => stepWeek(-1) },
				{ label: "Next week", action: () => stepWeek(1) },
				{ type: "separator" },
				{
					label: "Daily notes settings",
					action: onOpenDailyNotesSettings,
				},
			]);
		},
		[goToToday, onOpenDailyNotesSettings, openSelectedDailyNote, stepWeek],
	);

	const overdueTasks = data?.tasks.overdue ?? [];
	const noteActivity = data?.detail.note_activity ?? [];

	const daySummariesByDate = useMemo(
		() => new Map((data?.days ?? []).map((day) => [day.date, day])),
		[data?.days],
	);
	const selectedDaySummary = daySummariesByDate.get(selectedDate);
	const selectedDayTaskCount = selectedDaySummary?.task_count ?? 0;
	const selectedDateObj = useMemo(
		() => parseCalendarDate(selectedDate),
		[selectedDate],
	);
	const selectedHeading = useMemo(
		() => format(selectedDateObj, "EEEE, MMMM d"),
		[selectedDateObj],
	);

	return (
		<div className="calendarPaneOuter">
			<section className="calendarPane">
				<div className="calendarDashboard">
					<header className="calendarDashboardHeader">
						<div className="calendarDashboardTitleBlock">
							<h2>{selectedHeading}</h2>
							<p>{weekTitle(weekRange.dates)}</p>
						</div>
						<div className="calendarDashboardActions">
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								className="sidebarTopIconButton"
								onClick={() => stepWeek(-1)}
								aria-label="Previous week"
							>
								<HugeiconsIcon
									icon={ArrowLeftBigIcon}
									size="var(--icon-sm)"
									strokeWidth={0.9}
								/>
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								className="sidebarTopIconButton"
								onClick={goToToday}
								aria-label="Today"
							>
								<HugeiconsIcon
									icon={Calendar03Icon}
									size="var(--icon-md)"
									strokeWidth={0.9}
								/>
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								className="sidebarTopIconButton"
								onClick={() => stepWeek(1)}
								aria-label="Next week"
							>
								<HugeiconsIcon
									icon={ArrowRightBigIcon}
									size="var(--icon-sm)"
									strokeWidth={0.9}
								/>
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								className="sidebarTopIconButton"
								onClick={(event) => void openNativeMenu(event)}
								aria-label="Home menu"
							>
								<HugeiconsIcon
									icon={MoreHorizontalIcon}
									size="var(--icon-lg)"
									strokeWidth={0.9}
								/>
							</Button>
						</div>
					</header>

					{error || calendarQuery.error ? (
						<div className="calendarError">
							{error ||
								(calendarQuery.error instanceof Error
									? calendarQuery.error.message
									: String(calendarQuery.error))}
						</div>
					) : null}

					<section className="calendarWeekPanel">
						<div
							className="calendarWeekStrip"
							aria-label={weekTitle(weekRange.dates)}
						>
							{weekRange.dates.map((date) => {
								const parsed = parseCalendarDate(date);
								const isSelected = date === selectedDate;
								const dayOfWeek = parsed.getDay();
								const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
								const dayLabel = format(parsed, "EEEE, MMM d");
								return (
									<button
										type="button"
										key={date}
										className="calendarWeekDay"
										data-selected={isSelected ? "true" : undefined}
										data-weekend={isWeekend ? "true" : undefined}
										onClick={() => selectDay(date)}
										aria-label={dayLabel}
										title={dayLabel}
									>
										<span className="calendarWeekDayName">
											{format(parsed, "EEEEE")}
										</span>
										<strong className="calendarWeekDayNumber">
											{format(parsed, "d")}
										</strong>
									</button>
								);
							})}
						</div>
					</section>

					<div className="calendarWeekSummaryStrip">
						{noteActivity.length > 0 ? (
							<span className="calendarWeekSummaryItem">
								<HugeiconsIcon
									icon={NoteIcon}
									size="var(--icon-xs)"
									strokeWidth={1.15}
									aria-hidden
								/>
								<span className="calendarWeekSummaryCount">
									{noteActivity.length}
								</span>
								<span className="calendarWeekSummaryLabel">notes</span>
							</span>
						) : null}
						{selectedDaySummary?.has_daily_note ? (
							<span className="calendarWeekSummaryItem">
								<HugeiconsIcon
									icon={Calendar03Icon}
									size="var(--icon-xs)"
									strokeWidth={1.15}
									aria-hidden
								/>
								<span className="calendarWeekSummaryLabel">daily note</span>
							</span>
						) : null}
						{selectedDayTaskCount > 0 ? (
							<span className="calendarWeekSummaryItem">
								<HugeiconsIcon
									icon={CheckListIcon}
									size="var(--icon-xs)"
									strokeWidth={1.15}
									aria-hidden
								/>
								<span className="calendarWeekSummaryCount">
									{selectedDayTaskCount}
								</span>
								<span className="calendarWeekSummaryLabel">tasks</span>
							</span>
						) : null}
						{overdueTasks.length > 0 ? (
							<span className="calendarWeekSummaryItem">
								<HugeiconsIcon
									icon={AlertCircleIcon}
									size="var(--icon-xs)"
									strokeWidth={1.15}
									aria-hidden
								/>
								<span className="calendarWeekSummaryCount">
									{overdueTasks.length}
								</span>
								<span className="calendarWeekSummaryLabel">overdue</span>
							</span>
						) : null}
					</div>

					<div className="calendarDashboardContent">
						<section className="calendarPanelSection calendarNotesSection">
							<div className="calendarPanelSectionHeader">
								<div>
									<h3>Notes</h3>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="xs"
									className="calendarDailyNoteBtn"
									onClick={() => void openSelectedDailyNote()}
									aria-label={`Open or create note for ${format(selectedDateObj, "MMM d")}`}
									title={`Open or create note for ${format(selectedDateObj, "MMM d")}`}
								>
									<HugeiconsIcon
										icon={CalendarAdd01Icon}
										size="var(--icon-sm)"
										strokeWidth={0.9}
									/>
									Daily Note
								</Button>
							</div>
							<ul className="calendarNotesList">
								{noteActivity.length === 0 ? (
									<li className="calendarEmptyRow">
										<span className="calendarEmptyRowInner">
											<HugeiconsIcon
												icon={NoteIcon}
												size="var(--icon-2xl)"
												strokeWidth={0.6}
												aria-hidden
											/>
											No notes yet
										</span>
									</li>
								) : null}
								{noteActivity.map((note) => {
									const visibleTags = note.tags.slice(0, 2);
									const hiddenTagCount = Math.max(
										0,
										note.tags.length - visibleTags.length,
									);
									return (
										<li key={note.note_id}>
											<button
												type="button"
												className="calendarNoteRow"
												onClick={() => void onOpenFile(note.note_path)}
												onMouseEnter={() => prefetchNote(note.note_path)}
												onFocus={() => prefetchNote(note.note_path)}
											>
												<span className="calendarNoteIcon">
													<HugeiconsIcon
														icon={NoteIcon}
														size="var(--icon-md)"
														strokeWidth={0.9}
													/>
												</span>
												<span className="calendarNoteBody">
													<span className="calendarNoteTitleRow">
														<span className="calendarNoteTitle">
															{noteTitle(note)}
														</span>
														{visibleTags.length > 0 ? (
															<span className="calendarNoteTags">
																{visibleTags.map((tag) => (
																	<span key={tag} className="calendarNoteTag">
																		{beautifulTags ? (
																			<DatabaseColumnIcon
																				iconName={iconNameForTag(tag)}
																				className="calendarNoteTagIcon"
																				size="var(--icon-xs)"
																				strokeWidth={1.2}
																			/>
																		) : null}
																		{tag}
																	</span>
																))}
																{hiddenTagCount > 0 ? (
																	<span className="calendarNoteTag is-muted">
																		+{hiddenTagCount}
																	</span>
																) : null}
															</span>
														) : null}
													</span>
													{note.preview ? (
														<span className="calendarNotePreview">
															{note.preview}
														</span>
													) : null}
												</span>
												<span className="calendarNoteTime">
													{noteTimeLabel(note)}
												</span>
											</button>
										</li>
									);
								})}
							</ul>
						</section>
					</div>
				</div>
			</section>
		</div>
	);
}
