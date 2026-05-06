import {
	ArrowLeftBigIcon,
	ArrowRightBigIcon,
	CalendarAdd01Icon,
	Clock02Icon,
	Note03Icon,
	TaskAdd02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useSpace, useUILayoutContext } from "../../contexts";
import { useDailyNote } from "../../hooks/useDailyNote";
import {
	buildMonthRange,
	formatCalendarDate,
	formatMonthDay,
	formatMonthName,
	formatYear,
	insertTaskIntoDailyNote,
	parseCalendarDate,
	shiftMonth,
} from "../../lib/calendar";
import {
	getDailyNoteContent,
	getDailyNotePath,
	parseIsoDate,
} from "../../lib/dailyNotes";
import { isMissingFileError } from "../../lib/fsErrors";
import {
	loadCalendarData,
	navigationQueryKeys,
	prefetchNote,
} from "../../lib/navigationPrefetch";
import { todayIsoDateLocal } from "../../lib/tasks";
import {
	type CalendarRangeResponse,
	type TaskItem,
	invoke,
} from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
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
	initialData = null,
	onOpenFile,
	onOpenDailyNotesSettings,
}: CalendarPaneProps) {
	const today = useMemo(() => todayIsoDateLocal(), []);
	const [anchorDate, setAnchorDate] = useState(
		() => readStorage(ANCHOR_STORAGE_KEY) ?? todayIsoDateLocal(),
	);
	const [selectedDate, setSelectedDate] = useState(
		() => readStorage(SELECTED_STORAGE_KEY) ?? todayIsoDateLocal(),
	);
	const [error, setError] = useState("");
	const [taskDraft, setTaskDraft] = useState("");
	const [selectedRecentNotePath, setSelectedRecentNotePath] = useState<
		string | null
	>(null);
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
		() => ({ anchorDate, selectedDate, dailyNotesFolder }),
		[anchorDate, dailyNotesFolder, selectedDate],
	);
	const matchingInitialData = useMemo(() => {
		if (!initialData || initialData.detail.selected_date !== selectedDate) {
			return undefined;
		}
		const range = buildMonthRange(anchorDate);
		const lastDay = initialData.days[initialData.days.length - 1];
		if (
			initialData.days.length !== range.dates.length ||
			initialData.days[0]?.date !== range.start ||
			lastDay?.date !== range.end
		) {
			return undefined;
		}
		return initialData;
	}, [anchorDate, initialData, selectedDate]);
	const calendarQuery = useQuery({
		queryKey: navigationQueryKeys.calendarRange(calendarArgs),
		queryFn: () => loadCalendarData(calendarArgs),
		initialData: matchingInitialData,
	});
	const data = calendarQuery.data ?? null;
	const loading = calendarQuery.isFetching;

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

	const selectedTasks = data?.tasks;

	const goToToday = useCallback(() => {
		setAnchorDateAndPersist(today);
		setSelectedDateAndPersist(today);
	}, [setAnchorDateAndPersist, setSelectedDateAndPersist, today]);

	const stepRange = useCallback(
		(direction: -1 | 1) => {
			const nextAnchor = shiftMonth(anchorDate, direction);
			setAnchorDateAndPersist(nextAnchor);
			const nextRange = buildMonthRange(nextAnchor);
			if (!nextRange.dates.includes(selectedDate)) {
				setSelectedDateAndPersist(nextAnchor);
			}
		},
		[
			anchorDate,
			selectedDate,
			setAnchorDateAndPersist,
			setSelectedDateAndPersist,
		],
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

	const submitTaskMutation = useMutation({
		mutationFn: async () => {
			const normalized = taskDraft.replace(/\s+/g, " ").trim();
			if (!normalized) return;
			if (!dailyNotesFolder) {
				onOpenDailyNotesSettings();
				return;
			}
			setError("");
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
			queryClient.setQueryData(navigationQueryKeys.note(noteDoc.rel_path), {
				...noteDoc,
				text: nextMarkdown,
			});
		},
		onSuccess: async () => {
			await invalidateCalendar();
		},
		onError: (cause) => {
			setError(
				cause instanceof Error
					? cause.message
					: "Failed to create calendar task.",
			);
		},
	});

	const submitTask = useCallback(async () => {
		await submitTaskMutation.mutateAsync();
	}, [submitTaskMutation]);

	const toggleTaskMutation = useMutation({
		mutationFn: ({ task, checked }: { task: TaskItem; checked: boolean }) =>
			invoke("task_set_checked", {
				task_id: task.task_id,
				checked,
			}),
		onMutate: () => setError(""),
		onSuccess: async () => {
			await invalidateCalendar();
		},
		onError: (cause) => {
			setError(cause instanceof Error ? cause.message : String(cause));
		},
	});

	const toggleTask = useCallback(
		async (task: TaskItem, checked: boolean) => {
			try {
				await toggleTaskMutation.mutateAsync({ task, checked });
			} catch {
				// Mutation state owns the visible error.
			}
		},
		[toggleTaskMutation],
	);

	const scheduleTaskMutation = useMutation({
		mutationFn: ({
			task,
			scheduled,
			due,
		}: {
			task: TaskItem;
			scheduled: string | null;
			due: string | null;
		}) =>
			invoke("task_set_dates", {
				task_id: task.task_id,
				scheduled_date: scheduled,
				due_date: due,
			}),
		onMutate: () => setError(""),
		onSuccess: async () => {
			await invalidateCalendar();
		},
		onError: (cause) => {
			setError(cause instanceof Error ? cause.message : String(cause));
		},
	});

	const scheduleTask = useCallback(
		async (
			task: TaskItem,
			scheduled: string | null,
			due: string | null,
		): Promise<boolean> => {
			try {
				await scheduleTaskMutation.mutateAsync({ task, scheduled, due });
				return true;
			} catch {
				return false;
			}
		},
		[scheduleTaskMutation],
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

	const handleDaySelect = useCallback(
		(date: Date | undefined) => {
			if (date) {
				setSelectedDateAndPersist(formatCalendarDate(date));
			}
		},
		[setSelectedDateAndPersist],
	);

	const handleMonthChange = useCallback(
		(month: Date) => {
			setAnchorDateAndPersist(formatCalendarDate(month));
		},
		[setAnchorDateAndPersist],
	);

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
	const noteActivity = data?.detail.note_activity ?? [];

	const effectiveSelectedRecentNotePath = useMemo(() => {
		if (!selectedRecentNotePath) return null;
		return noteActivity.some(
			(item) => item.note_path === selectedRecentNotePath,
		)
			? selectedRecentNotePath
			: null;
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
				{error || calendarQuery.error ? (
					<div className="calendarError">
						{error ||
							(calendarQuery.error instanceof Error
								? calendarQuery.error.message
								: String(calendarQuery.error))}
					</div>
				) : null}

				{/* ── Centered content area ── */}
				<div className="calendarCenterWrap">
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
								variant="outline"
								className="calendarTaskBtn"
								onClick={() => void submitTask()}
								disabled={submitTaskMutation.isPending || !taskDraft.trim()}
								aria-label="Add task"
							>
								<HugeiconsIcon
									icon={TaskAdd02Icon}
									size={16}
									strokeWidth={0.9}
								/>
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="calendarTaskBtn"
								data-size="sm"
								onClick={openSelectedDailyNote}
							>
								<HugeiconsIcon
									icon={CalendarAdd01Icon}
									size={14}
									strokeWidth={0.9}
								/>
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
										<HugeiconsIcon
											icon={Note03Icon}
											size={16}
											strokeWidth={0.9}
										/>
										Tasks
									</h4>
								</div>
								<div className="calendarTasksScrollArea">
									{renderTaskGroup("For this day", agendaTasks)}
									{renderTaskGroup("Overdue", overdueTasks)}
									{renderTaskGroup("Ongoing", ongoingTasks)}
								</div>
							</div>
							<div className="calendarMiniDb">
								<div className="calendarCardSectionHeader calendarMiniDbHeader">
									<div className="calendarMiniDbHeaderInfo">
										<h4 className="calendarCardSectionTitle">
											<HugeiconsIcon
												icon={Clock02Icon}
												size={14}
												strokeWidth={0.9}
											/>
											<span>Activity</span>
										</h4>
									</div>
								</div>
								<RecentNotesBoardStrip
									notes={noteActivity}
									selectedNotePath={effectiveSelectedRecentNotePath}
									onSelectNote={handleSelectRecentNote}
									onOpenNote={handleOpenRecentNote}
									onPrefetchNote={prefetchNote}
								/>
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
										className="calendarTaskBtn"
										data-size="icon"
										onClick={() => stepRange(-1)}
										aria-label="Previous month"
									>
										<HugeiconsIcon
											icon={ArrowLeftBigIcon}
											size={14}
											strokeWidth={0.9}
											aria-hidden="true"
										/>
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="calendarTaskBtn"
										data-size="sm"
										onClick={goToToday}
									>
										Today
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="calendarTaskBtn"
										data-size="icon"
										onClick={() => stepRange(1)}
										aria-label="Next month"
									>
										<HugeiconsIcon
											icon={ArrowRightBigIcon}
											size={14}
											strokeWidth={0.9}
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
