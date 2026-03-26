import { ArrowLeft, ArrowRight } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSpace, useUILayoutContext } from "../../contexts";
import { useDailyNote } from "../../hooks/useDailyNote";
import {
	type CalendarViewMode,
	buildMonthRange,
	buildWeekRange,
	formatCalendarDate,
	formatDayTitle,
	formatMonthDay,
	formatMonthTitle,
	formatWeekday,
	insertTaskIntoDailyNote,
	parseCalendarDate,
	relativeDayLabel,
	shiftMonth,
	shiftWeek,
} from "../../lib/calendar";
import {
	getDailyNoteContent,
	getDailyNotePath,
	parseIsoDate,
} from "../../lib/dailyNotes";
import { isMissingFileError } from "../../lib/fsErrors";
import { todayIsoDateLocal } from "../../lib/tasks";
import {
	type CalendarRangeResponse,
	type TaskItem,
	invoke,
} from "../../lib/tauri";
import { renderTemplate } from "../../lib/templates";
import { cn } from "../../lib/utils";
import {
	Calendar,
	FileText,
	ListChecks,
	Plus,
	Settings,
	StickyNote,
} from "../Icons";
import { TaskRow } from "../tasks/TaskRow";
import { springPresets } from "../ui/animations";
import { Button } from "../ui/shadcn/button";
import { Calendar as ShadcnCalendar } from "../ui/shadcn/calendar";
import { Input } from "../ui/shadcn/input";

const VIEW_STORAGE_KEY = "glyph.calendar.viewMode";
const ANCHOR_STORAGE_KEY = "glyph.calendar.anchorDate";
const SELECTED_STORAGE_KEY = "glyph.calendar.selectedDate";

interface CalendarPaneProps {
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

function formatActivityTime(iso: string): string {
	try {
		return new Date(iso).toLocaleTimeString([], {
			hour: "numeric",
			minute: "2-digit",
		});
	} catch {
		return "";
	}
}

function getNoteBreadcrumb(notePath: string): string {
	const parts = notePath.split("/").filter(Boolean);
	if (parts.length <= 1) return "";
	return parts.slice(0, -1).join(" / ");
}

function getTimeGreeting(): string {
	const hour = new Date().getHours();
	if (hour < 12) return "Good morning";
	if (hour < 17) return "Good afternoon";
	return "Good evening";
}

function getTaskGroupMeta(label: string): {
	displayLabel: string;
	tone: "danger" | "info" | "warning" | "neutral";
} {
	if (label === "Overdue") {
		return { displayLabel: "Overdue", tone: "danger" };
	}
	if (label === "For this day") {
		return { displayLabel: "Agenda", tone: "info" };
	}
	if (label === "Ongoing") {
		return { displayLabel: "Ongoing", tone: "warning" };
	}
	return { displayLabel: label, tone: "neutral" };
}

export function CalendarPane({
	onOpenFile,
	onOpenDailyNotesSettings,
}: CalendarPaneProps) {
	const today = useMemo(() => todayIsoDateLocal(), []);
	const initialAnchor = readStorage(ANCHOR_STORAGE_KEY) ?? today;
	const initialSelected = readStorage(SELECTED_STORAGE_KEY) ?? today;
	const initialView =
		readStorage(VIEW_STORAGE_KEY) === "week" ? "week" : "month";
	const [viewMode, setViewMode] = useState<CalendarViewMode>(initialView);
	const [anchorDate, setAnchorDate] = useState(initialAnchor);
	const [selectedDate, setSelectedDate] = useState(initialSelected);
	const [data, setData] = useState<CalendarRangeResponse | null>(null);
	const [todayData, setTodayData] = useState<CalendarRangeResponse | null>(
		null,
	);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [taskDraft, setTaskDraft] = useState("");
	const [isSubmittingTask, setIsSubmittingTask] = useState(false);
	const loadRequestIdRef = useRef(0);
	const todayLoadRequestIdRef = useRef(0);
	const { dailyNotesFolder, dailyNoteTemplatePath } = useUILayoutContext();
	const { spacePath } = useSpace();
	const { openOrCreateDailyNoteAtDate } = useDailyNote({
		onOpenFile,
		setError,
		spacePath,
		templatePath: dailyNoteTemplatePath,
	});

	const range = useMemo(
		() =>
			viewMode === "month"
				? buildMonthRange(anchorDate)
				: buildWeekRange(anchorDate),
		[anchorDate, viewMode],
	);

	const loadCalendar = useCallback(async () => {
		const requestId = ++loadRequestIdRef.current;
		setLoading(true);
		setError("");
		try {
			const next = await invoke("calendar_query_range", {
				start_date: range.start,
				end_date: range.end,
				selected_date: selectedDate,
				daily_notes_folder: dailyNotesFolder,
			});
			if (loadRequestIdRef.current !== requestId) {
				return;
			}
			setData(next);
		} catch (cause) {
			if (loadRequestIdRef.current !== requestId) {
				return;
			}
			setError(cause instanceof Error ? cause.message : String(cause));
			setData(null);
		} finally {
			if (loadRequestIdRef.current === requestId) {
				setLoading(false);
			}
		}
	}, [dailyNotesFolder, range.end, range.start, selectedDate]);

	const loadTodaySummary = useCallback(async () => {
		const requestId = ++todayLoadRequestIdRef.current;
		try {
			const next = await invoke("calendar_query_range", {
				start_date: today,
				end_date: today,
				selected_date: today,
				daily_notes_folder: dailyNotesFolder,
			});
			if (todayLoadRequestIdRef.current !== requestId) {
				return;
			}
			setTodayData(next);
		} catch {
			if (todayLoadRequestIdRef.current === requestId) {
				setTodayData(null);
			}
		}
	}, [dailyNotesFolder, today]);

	useEffect(() => {
		void loadCalendar();
	}, [loadCalendar]);

	useEffect(() => {
		void loadTodaySummary();
	}, [loadTodaySummary]);

	const reloadCalendarData = useCallback(async () => {
		await Promise.all([loadCalendar(), loadTodaySummary()]);
	}, [loadCalendar, loadTodaySummary]);

	useEffect(() => {
		writeStorage(VIEW_STORAGE_KEY, viewMode);
	}, [viewMode]);

	useEffect(() => {
		writeStorage(ANCHOR_STORAGE_KEY, anchorDate);
	}, [anchorDate]);

	useEffect(() => {
		writeStorage(SELECTED_STORAGE_KEY, selectedDate);
	}, [selectedDate]);

	const summaryByDate = useMemo(
		() =>
			new Map(
				(data?.days ?? []).map((summary) => [summary.date, summary] as const),
			),
		[data?.days],
	);

	const selectedTasks = data?.tasks;
	const todaySummary =
		todayData?.days.find((summary) => summary.date === today) ??
		(selectedDate === today ? summaryByDate.get(today) : undefined);
	const todayTasks = todayData?.tasks;
	const greeting = useMemo(() => getTimeGreeting(), []);
	const todayTaskCount =
		todaySummary?.task_count ??
		(todayTasks?.for_day.length ?? 0) + (todayTasks?.ongoing.length ?? 0);
	const todayNoteCount =
		todayData?.detail.note_activity.length ??
		todaySummary?.note_activity_count ??
		0;
	const todayHasDailyNote =
		todayData?.detail.has_daily_note ?? todaySummary?.has_daily_note ?? false;
	const todayOverdueCount = todayTasks?.overdue.length ?? 0;

	const goToToday = useCallback(() => {
		setAnchorDate(today);
		setSelectedDate(today);
	}, [today]);

	const changeViewMode = useCallback(
		(next: CalendarViewMode) => {
			setViewMode(next);
			setAnchorDate(selectedDate);
		},
		[selectedDate],
	);

	const stepRange = useCallback(
		(direction: -1 | 1) => {
			const nextAnchor =
				viewMode === "month"
					? shiftMonth(anchorDate, direction)
					: shiftWeek(anchorDate, direction);
			setAnchorDate(nextAnchor);
			const nextRange =
				viewMode === "month"
					? buildMonthRange(nextAnchor)
					: buildWeekRange(nextAnchor);
			if (!nextRange.dates.includes(selectedDate)) {
				setSelectedDate(nextRange.dates[0] ?? nextAnchor);
			}
		},
		[anchorDate, selectedDate, viewMode],
	);

	const ensureDailyNoteExistsForTask = useCallback(
		async (date: string) => {
			if (!dailyNotesFolder) {
				throw new Error("Set a daily notes folder before adding tasks.");
			}
			const notePath = getDailyNotePath(dailyNotesFolder, date);
			try {
				const existing = await invoke("space_read_text", { path: notePath });
				return existing;
			} catch (cause) {
				if (!isMissingFileError(cause)) {
					throw cause;
				}
			}

			let content = getDailyNoteContent(date);
			if (dailyNoteTemplatePath) {
				try {
					const templateDoc = await invoke("space_read_text", {
						path: dailyNoteTemplatePath,
					});
					content = renderTemplate(templateDoc.text, {
						destinationPath: notePath,
						spaceRootPath: spacePath,
						date: parseIsoDate(date) ?? new Date(),
					});
				} catch (cause) {
					if (!isMissingFileError(cause)) {
						throw cause;
					}
				}
			}

			await invoke("space_open_or_create_text", {
				path: notePath,
				text: content,
			});
			return invoke("space_read_text", { path: notePath });
		},
		[dailyNoteTemplatePath, dailyNotesFolder, spacePath],
	);

	const submitTask = useCallback(async () => {
		const normalized = taskDraft.replace(/\s+/g, " ").trim();
		if (!normalized) return;
		if (!dailyNotesFolder) {
			onOpenDailyNotesSettings();
			return;
		}
		setIsSubmittingTask(true);
		setError("");
		try {
			const noteDoc = await ensureDailyNoteExistsForTask(selectedDate);
			const nextMarkdown = insertTaskIntoDailyNote(
				noteDoc.text,
				normalized,
				selectedDate,
			);
			await invoke("space_write_text", {
				path: noteDoc.rel_path,
				text: nextMarkdown,
				base_mtime_ms: noteDoc.mtime_ms,
			});
			setTaskDraft("");
			await reloadCalendarData();
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Failed to create calendar task.",
			);
		} finally {
			setIsSubmittingTask(false);
		}
	}, [
		dailyNotesFolder,
		ensureDailyNoteExistsForTask,
		onOpenDailyNotesSettings,
		reloadCalendarData,
		selectedDate,
		taskDraft,
	]);

	const toggleTask = useCallback(
		async (task: TaskItem, checked: boolean) => {
			try {
				setError("");
				await invoke("task_set_checked", {
					task_id: task.task_id,
					checked,
				});
				await reloadCalendarData();
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : String(cause));
			}
		},
		[reloadCalendarData],
	);

	const scheduleTask = useCallback(
		async (
			task: TaskItem,
			scheduled: string | null,
			due: string | null,
		): Promise<boolean> => {
			try {
				setError("");
				await invoke("task_set_dates", {
					task_id: task.task_id,
					scheduled_date: scheduled,
					due_date: due,
				});
				await reloadCalendarData();
				return true;
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : String(cause));
				return false;
			}
		},
		[reloadCalendarData],
	);

	const openDailyNoteForDate = useCallback(
		async (date: string) => {
			if (!dailyNotesFolder) {
				onOpenDailyNotesSettings();
				return;
			}
			await openOrCreateDailyNoteAtDate(dailyNotesFolder, date);
			await reloadCalendarData();
		},
		[
			dailyNotesFolder,
			onOpenDailyNotesSettings,
			openOrCreateDailyNoteAtDate,
			reloadCalendarData,
		],
	);

	const openSelectedDailyNote = useCallback(async () => {
		await openDailyNoteForDate(selectedDate);
	}, [openDailyNoteForDate, selectedDate]);

	const openTodayDailyNote = useCallback(async () => {
		await openDailyNoteForDate(today);
	}, [openDailyNoteForDate, today]);

	const renderTaskGroup = useCallback(
		(label: string, tasks: TaskItem[]) => {
			if (tasks.length === 0) return null;
			const { displayLabel, tone } = getTaskGroupMeta(label);
			return (
				<div className="calendarTaskGroup">
					<div className="calendarSectionHeader">
						<h4 className="calendarSectionTitle">
							<span className={cn("calendarSectionLabelPill", `is-${tone}`)}>
								{displayLabel}
							</span>
						</h4>
						<span className="calendarSectionCount">{tasks.length}</span>
					</div>
					<div className="calendarTaskList">
						{tasks.map((task) => (
							<TaskRow
								key={task.task_id}
								task={task}
								today={selectedDate}
								showNoteContext
								onToggle={toggleTask}
								onSchedule={scheduleTask}
								onOpenNote={(notePath) => void onOpenFile(notePath)}
							/>
						))}
					</div>
				</div>
			);
		},
		[onOpenFile, scheduleTask, selectedDate, toggleTask],
	);

	/* shadcn Calendar integration */
	const selectedDateObj = useMemo(
		() => parseCalendarDate(selectedDate),
		[selectedDate],
	);
	const anchorDateObj = useMemo(
		() => parseCalendarDate(anchorDate),
		[anchorDate],
	);
	const todayDateObj = useMemo(() => parseCalendarDate(today), [today]);

	const handleDaySelect = useCallback((date: Date | undefined) => {
		if (date) {
			setSelectedDate(formatCalendarDate(date));
		}
	}, []);

	const handleMonthChange = useCallback((month: Date) => {
		setAnchorDate(formatCalendarDate(month));
	}, []);

	/* Dates that have activity (tasks or notes) for dot indicators */
	const datesWithActivity = useMemo(() => {
		const set = new Set<string>();
		for (const day of data?.days ?? []) {
			if (
				day.task_count > 0 ||
				day.note_activity_count > 0 ||
				day.has_daily_note
			) {
				set.add(day.date);
			}
		}
		return set;
	}, [data?.days]);

	const agendaTasks = selectedTasks?.for_day ?? [];
	const overdueTasks = selectedTasks?.overdue ?? [];
	const ongoingTasks = selectedTasks?.ongoing ?? [];
	const hasAnyTasks =
		agendaTasks.length > 0 ||
		overdueTasks.length > 0 ||
		ongoingTasks.length > 0;
	const noteActivity = data?.detail.note_activity ?? [];

	return (
		<section className="calendarPane">
			<div className="calendarToolbar">
				<div className="calendarTitleBlock">
					<h2 className="calendarTitle">{formatMonthTitle(anchorDate)}</h2>
				</div>
				<div className="calendarToolbarActions">
					<div
						className="databaseModeSwitch calendarModeSwitch"
						aria-label="Calendar view"
					>
						<m.button
							type="button"
							layout
							className="databaseModePill"
							data-active={viewMode === "month"}
							onClick={() => changeViewMode("month")}
							title="Month view"
							aria-label="Month view"
							aria-pressed={viewMode === "month"}
							whileTap={{ scale: 0.94 }}
							transition={springPresets.gentle}
						>
							{viewMode === "month" ? (
								<m.span
									className="databaseModePillBg"
									layoutId="calendarModeActive"
									transition={springPresets.gentle}
								/>
							) : null}
							<span>Month</span>
						</m.button>
						<m.button
							type="button"
							layout
							className="databaseModePill"
							data-active={viewMode === "week"}
							onClick={() => changeViewMode("week")}
							title="Week view"
							aria-label="Week view"
							aria-pressed={viewMode === "week"}
							whileTap={{ scale: 0.94 }}
							transition={springPresets.gentle}
						>
							{viewMode === "week" ? (
								<m.span
									className="databaseModePillBg"
									layoutId="calendarModeActive"
									transition={springPresets.gentle}
								/>
							) : null}
							<span>Week</span>
						</m.button>
					</div>
					<div className="calendarToolbarNav">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => stepRange(-1)}
						>
							<HugeiconsIcon icon={ArrowLeft} size={14} />
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={goToToday}
						>
							Today
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => stepRange(1)}
						>
							<HugeiconsIcon icon={ArrowRight} size={14} />
						</Button>
					</div>
				</div>
			</div>

			{error ? <div className="calendarError">{error}</div> : null}

			<div className={cn("calendarLayout", viewMode === "week" && "is-week")}>
				{/* ── Left column ── */}
				<div className="calendarLeftCol">
					{viewMode === "month" ? (
						<div className="calendarShadcnWrap">
							<ShadcnCalendar
								mode="single"
								selected={selectedDateObj}
								onSelect={handleDaySelect}
								month={anchorDateObj}
								onMonthChange={handleMonthChange}
								today={todayDateObj}
								className="calendarDashboardPicker"
								modifiers={{
									hasActivity: (date: Date) =>
										datesWithActivity.has(formatCalendarDate(date)),
								}}
								modifiersClassNames={{ hasActivity: "calendarDayHasActivity" }}
							/>
						</div>
					) : (
						<div className="calendarWeekStack">
							{range.dates.map((date) => {
								const summary = summaryByDate.get(date);
								const isSelected = date === selectedDate;
								const isDateToday = date === today;
								return (
									<button
										key={date}
										type="button"
										className={cn(
											"calendarWeekRow",
											isSelected && "is-selected",
											isDateToday && "is-today",
										)}
										onClick={() => setSelectedDate(date)}
									>
										<div className="calendarWeekRowLeft">
											<span className="calendarWeekRowDay">
												{formatDayTitle(date)}
											</span>
											{isDateToday ? (
												<span className="calendarWeekTodayDot" />
											) : null}
											<span className="calendarWeekRowSub">
												{!isDateToday
													? (relativeDayLabel(date, today) ??
														formatWeekday(date))
													: formatWeekday(date)}
											</span>
										</div>
										<div className="calendarWeekRowRight">
											{summary?.task_count ? (
												<span>
													{summary.task_count}{" "}
													{summary.task_count === 1 ? "task" : "tasks"}
												</span>
											) : null}
											{summary?.note_activity_count ? (
												<span>
													{summary.note_activity_count}{" "}
													{summary.note_activity_count === 1 ? "note" : "notes"}
												</span>
											) : null}
										</div>
									</button>
								);
							})}
						</div>
					)}

					{/* Welcome / today glance */}
					{data ? (
						<div className="calendarWelcome">
							<p className="calendarWelcomeGreeting">{greeting}</p>
							<p className="calendarWelcomeSummary">
								{todayTaskCount > 0 ||
								todayOverdueCount > 0 ||
								todayNoteCount > 0 ||
								todayHasDailyNote ? (
									<>
										{todayTaskCount > 0 ? (
											<span className="calendarWelcomeItem">
												<ListChecks size={13} />
												<strong>
													{todayTaskCount}{" "}
													{todayTaskCount === 1 ? "task" : "tasks"}
												</strong>
											</span>
										) : null}
										{todayOverdueCount > 0 ? (
											<span className="calendarWelcomeItem is-overdue">
												<Calendar size={13} />
												<strong>{todayOverdueCount} overdue</strong>
											</span>
										) : null}
										{todayNoteCount > 0 ? (
											<span className="calendarWelcomeItem">
												<StickyNote size={13} />
												<strong>
													{todayNoteCount}{" "}
													{todayNoteCount === 1 ? "note" : "notes"}
												</strong>
											</span>
										) : null}
										{todayHasDailyNote ? (
											<button
												type="button"
												className="calendarWelcomeItem calendarWelcomeLink"
												onClick={openTodayDailyNote}
											>
												<FileText size={13} />
												<strong>daily note</strong>
											</button>
										) : null}
									</>
								) : (
									<span className="calendarWelcomeEmpty">
										Nothing scheduled for today.
									</span>
								)}
							</p>
						</div>
					) : null}
				</div>

				{/* ── Right column: selected day detail ── */}
				<div className="calendarDetailCol">
					{/* Day header */}
					<div className="calendarDetailHeader">
						<div className="calendarDetailHeading">
							<h3 className="calendarDetailTitle">
								{formatDayTitle(selectedDate)}
							</h3>
							<span className="calendarDetailSubtext">
								{relativeDayLabel(selectedDate, today) ??
									formatWeekday(selectedDate)}
							</span>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={openSelectedDailyNote}
						>
							<FileText size={14} />
							{data?.detail.has_daily_note
								? "Open daily note"
								: "Create daily note"}
						</Button>
					</div>

					{/* Task composer */}
					{dailyNotesFolder ? (
						<div className="calendarTaskComposer">
							<Input
								value={taskDraft}
								onChange={(event) => setTaskDraft(event.target.value)}
								placeholder={`Add a task for ${formatMonthDay(selectedDate)}`}
								onKeyDown={(event) => {
									if (event.key === "Enter" && !event.shiftKey) {
										event.preventDefault();
										void submitTask();
									}
								}}
							/>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="calendarTaskAddIcon"
								onClick={() => void submitTask()}
								disabled={isSubmittingTask || !taskDraft.trim()}
								aria-label="Add task"
							>
								<Plus size={16} />
							</Button>
						</div>
					) : (
						<div className="calendarInlineSetup">
							<div>
								Set a daily notes folder to create tasks directly from the
								calendar.
							</div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={onOpenDailyNotesSettings}
							>
								<Settings size={14} />
								Set daily notes folder
							</Button>
						</div>
					)}

					{/* Task groups — only shown if they have items */}
					<div className="calendarTasksArea">
						{renderTaskGroup("For this day", agendaTasks)}
						{renderTaskGroup("Overdue", overdueTasks)}
						{renderTaskGroup("Ongoing", ongoingTasks)}
						{!hasAnyTasks ? (
							<div className="calendarEmptyText">No tasks for this day.</div>
						) : null}
					</div>

					{/* Notes */}
					<div className="calendarNotesArea">
						<div className="calendarSectionHeader">
							<h4 className="calendarSectionTitle">
								<span className="calendarSectionLabelPill">Notes</span>
							</h4>
							{noteActivity.length > 0 ? (
								<span className="calendarSectionCount">
									{noteActivity.length}
								</span>
							) : null}
						</div>
						{noteActivity.length > 0 ? (
							<div className="calendarNotesList">
								{noteActivity.map((item) => (
									<button
										key={item.note_id}
										type="button"
										className="calendarNoteRow"
										onClick={() => void onOpenFile(item.note_path)}
									>
										<div className="calendarNoteRowMain">
											<span className="calendarNoteTitle">{item.title}</span>
											{getNoteBreadcrumb(item.note_path) ? (
												<span className="calendarNotePath">
													{getNoteBreadcrumb(item.note_path)}
												</span>
											) : null}
										</div>
										{item.edited_on_day ? (
											<span className="calendarNoteTime">
												{formatActivityTime(item.updated)}
											</span>
										) : null}
									</button>
								))}
							</div>
						) : (
							<div className="calendarEmptyText">
								No note activity for this day.
							</div>
						)}
					</div>
				</div>
			</div>

			{loading ? <div className="calendarLoading">Refreshing…</div> : null}
		</section>
	);
}

export default CalendarPane;
