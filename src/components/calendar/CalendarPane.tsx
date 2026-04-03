import {
	ArrowLeftBigIcon,
	ArrowRightBigIcon,
	CalendarAdd01Icon,
	Clock02Icon,
	Note03Icon,
	TaskAdd02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	type CSSProperties,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useSpace, useUILayoutContext } from "../../contexts";
import { useDailyNote } from "../../hooks/useDailyNote";
import {
	buildMonthRange,
	formatCalendarDate,
	formatDayTitle,
	formatMonthDay,
	formatMonthName,
	formatWeekday,
	formatYear,
	insertTaskIntoDailyNote,
	parseCalendarDate,
	relativeDayLabel,
	shiftMonth,
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
import { Settings } from "../Icons";
import { TaskRow } from "../tasks/TaskRow";
import { Button } from "../ui/shadcn/button";
import { Calendar as ShadcnCalendar } from "../ui/shadcn/calendar";
import { Input } from "../ui/shadcn/input";
import { RecentNotesBoardStrip } from "./RecentNotesBoardStrip";

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
	const [anchorDate, setAnchorDate] = useState(initialAnchor);
	const [selectedDate, setSelectedDate] = useState(initialSelected);
	const [data, setData] = useState<CalendarRangeResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [taskDraft, setTaskDraft] = useState("");
	const [isSubmittingTask, setIsSubmittingTask] = useState(false);
	const [selectedRecentNotePath, setSelectedRecentNotePath] = useState<
		string | null
	>(null);
	const loadRequestIdRef = useRef(0);
	const { dailyNotesFolder, dailyNoteTemplatePath } = useUILayoutContext();
	const { spacePath } = useSpace();
	const { openOrCreateDailyNoteAtDate } = useDailyNote({
		onOpenFile,
		setError,
		spacePath,
		templatePath: dailyNoteTemplatePath,
	});

	const range = useMemo(() => buildMonthRange(anchorDate), [anchorDate]);

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

	useEffect(() => {
		void loadCalendar();
	}, [loadCalendar]);

	useEffect(() => {
		writeStorage(ANCHOR_STORAGE_KEY, anchorDate);
	}, [anchorDate]);

	useEffect(() => {
		writeStorage(SELECTED_STORAGE_KEY, selectedDate);
	}, [selectedDate]);

	const selectedTasks = data?.tasks;

	const goToToday = useCallback(() => {
		setAnchorDate(today);
		setSelectedDate(today);
	}, [today]);

	const stepRange = useCallback(
		(direction: -1 | 1) => {
			const nextAnchor = shiftMonth(anchorDate, direction);
			setAnchorDate(nextAnchor);
			const nextRange = buildMonthRange(nextAnchor);
			if (!nextRange.dates.includes(selectedDate)) {
				setSelectedDate(nextAnchor);
			}
		},
		[anchorDate, selectedDate],
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
			await loadCalendar();
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
		loadCalendar,
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
				await loadCalendar();
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : String(cause));
			}
		},
		[loadCalendar],
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
				await loadCalendar();
				return true;
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : String(cause));
				return false;
			}
		},
		[loadCalendar],
	);

	const openDailyNoteForDate = useCallback(
		async (date: string) => {
			if (!dailyNotesFolder) {
				onOpenDailyNotesSettings();
				return;
			}
			await openOrCreateDailyNoteAtDate(dailyNotesFolder, date);
			await loadCalendar();
		},
		[
			dailyNotesFolder,
			onOpenDailyNotesSettings,
			openOrCreateDailyNoteAtDate,
			loadCalendar,
		],
	);

	const openSelectedDailyNote = useCallback(async () => {
		await openDailyNoteForDate(selectedDate);
	}, [openDailyNoteForDate, selectedDate]);

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
	const activityExtraWidth = useMemo(() => {
		if (noteActivity.length >= 4) return 240;
		if (noteActivity.length === 3) return 160;
		if (noteActivity.length === 2) return 80;
		return 0;
	}, [noteActivity.length]);

	useEffect(() => {
		if (!selectedRecentNotePath) return;
		if (
			noteActivity.some((item) => item.note_path === selectedRecentNotePath)
		) {
			return;
		}
		setSelectedRecentNotePath(null);
	}, [noteActivity, selectedRecentNotePath]);
	const handleSelectRecentNote = useCallback((notePath: string) => {
		setSelectedRecentNotePath(notePath);
	}, []);
	const handleOpenRecentNote = useCallback(
		(notePath: string) => {
			setSelectedRecentNotePath(notePath);
			void onOpenFile(notePath);
		},
		[onOpenFile],
	);

	return (
		<div className="calendarPaneOuter">
			<section className="calendarPane">
				{error ? <div className="calendarError">{error}</div> : null}

				{/* ── Date header (centered) ── */}
				<div className="calendarDetailHeader">
					<h3 className="calendarDetailTitle">
						{formatDayTitle(selectedDate)}
					</h3>
					<span className="calendarDetailSubtext">
						{relativeDayLabel(selectedDate, today) ??
							formatWeekday(selectedDate)}
					</span>
				</div>

				{/* ── Centered content area ── */}
				<div className="calendarCenterWrap">
					{/* ── Recent notes card strip ── */}
					{noteActivity.length > 0 ? (
						<div
							className="calendarMiniDb"
							style={
								{
									"--calendar-activity-extra-width": `${activityExtraWidth}px`,
								} as CSSProperties
							}
						>
							<div className="calendarCardSectionHeader calendarMiniDbHeader">
								<div className="calendarMiniDbHeaderInfo">
									<h4 className="calendarCardSectionTitle">
										<HugeiconsIcon icon={Clock02Icon} size={14} />
										<span>Activity</span>
									</h4>
								</div>
							</div>
							<RecentNotesBoardStrip
								notes={noteActivity}
								selectedNotePath={selectedRecentNotePath}
								onSelectNote={handleSelectRecentNote}
								onOpenNote={handleOpenRecentNote}
							/>
						</div>
					) : null}

					{/* ── Task composer ── */}
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
								className="calendarTaskAddIcon calendarTaskBtn"
								onClick={() => void submitTask()}
								disabled={isSubmittingTask || !taskDraft.trim()}
								aria-label="Add task"
							>
								<HugeiconsIcon icon={TaskAdd02Icon} size={16} />
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="calendarTaskBtn calendarOpenNoteBtn"
								onClick={openSelectedDailyNote}
							>
								<HugeiconsIcon icon={CalendarAdd01Icon} size={14} />
								Daily Note
							</Button>
						</div>
					) : (
						<div className="calendarInlineSetup">
							<div>
								Set a daily notes folder to create tasks directly from the
								calendar.
							</div>
							<div className="calendarInlineSetupActions">
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
						</div>
					)}

					{/* ── Two-column: tasks + calendar ── */}
					<div className="calendarLayout">
						<div className="calendarDetailCol">
							<div className="calendarCardSection calendarTasksCard">
								<div className="calendarCardSectionHeader">
									<h4 className="calendarCardSectionTitle">
										<HugeiconsIcon icon={Note03Icon} size={16} />
										Tasks
									</h4>
								</div>
								<div className="calendarTasksScrollArea">
									{renderTaskGroup("For this day", agendaTasks)}
									{renderTaskGroup("Overdue", overdueTasks)}
									{renderTaskGroup("Ongoing", ongoingTasks)}
									{!hasAnyTasks ? (
										<div className="calendarEmptyText">
											No tasks for this day.
										</div>
									) : null}
								</div>
							</div>
						</div>

						<div className="calendarLeftCol">
							<div className="calendarToolbarNav">
								<span className="calendarMonthYearLabel">
									<strong>{formatMonthName(anchorDateObj)}</strong>{" "}
									{formatYear(anchorDateObj)}
								</span>
								<span className="calendarToolbarButtons">
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="calendarTaskBtn calendarToolbarIconBtn"
										onClick={() => stepRange(-1)}
										aria-label="Previous month"
									>
										<HugeiconsIcon
											icon={ArrowLeftBigIcon}
											size={14}
											aria-hidden="true"
										/>
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="calendarTaskBtn calendarOpenNoteBtn"
										onClick={goToToday}
									>
										Today
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="calendarTaskBtn calendarToolbarIconBtn"
										onClick={() => stepRange(1)}
										aria-label="Next month"
									>
										<HugeiconsIcon
											icon={ArrowRightBigIcon}
											size={14}
											aria-hidden="true"
										/>
									</Button>
								</span>
							</div>
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
									modifiersClassNames={{
										hasActivity: "calendarDayHasActivity",
									}}
								/>
							</div>
						</div>
					</div>
				</div>

				{loading ? <div className="calendarLoading">Refreshing…</div> : null}
			</section>
		</div>
	);
}
