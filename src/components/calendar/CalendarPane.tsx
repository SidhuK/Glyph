import {
	ArrowLeftBigIcon,
	ArrowRightBigIcon,
	Calendar03Icon,
	MoreHorizontalIcon,
	NoteIcon,
	TaskAdd02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { useSpace, useUILayoutContext } from "../../contexts";
import { useDailyNote } from "../../hooks/useDailyNote";
import {
	buildWeekRange,
	insertTaskIntoDailyNote,
	parseCalendarDate,
	shiftWeek,
} from "../../lib/calendar";
import {
	getDailyNoteContent,
	getDailyNotePath,
	parseIsoDate,
} from "../../lib/dailyNotes";
import { isMissingFileError } from "../../lib/fsErrors";
import { showNativePopupMenu } from "../../lib/nativeContextMenu";
import {
	loadCalendarData,
	navigationQueryKeys,
	prefetchNote,
} from "../../lib/navigationPrefetch";
import { todayIsoDateLocal } from "../../lib/tasks";
import {
	type CalendarNoteActivityItem,
	type CalendarRangeResponse,
	type TaskItem,
	invoke,
} from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { renderTemplate } from "../../lib/templates";
import { Settings } from "../Icons";
import { TaskRow } from "../tasks/TaskRow";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";

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

function selectedMonthLabel(date: string): { month: string; year: string } {
	const parsed = parseCalendarDate(date);
	return {
		month: format(parsed, "MMM"),
		year: format(parsed, "yyyy"),
	};
}

function getTaskGroupMeta(label: string): {
	displayLabel: string;
} {
	if (label === "For this day") return { displayLabel: "Tasks" };
	return { displayLabel: label };
}

export function CalendarPane({
	initialData = null,
	onOpenFile,
	onOpenDailyNotesSettings,
}: CalendarPaneProps) {
	const today = useMemo(() => todayIsoDateLocal(), []);
	const initialSelectedDate = useMemo(
		() => readStorage(SELECTED_STORAGE_KEY) ?? todayIsoDateLocal(),
		[],
	);
	const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
	const [anchorDate, setAnchorDate] = useState(
		() => readStorage(ANCHOR_STORAGE_KEY) ?? initialSelectedDate,
	);
	const normalizedAnchorDate = isDateInsideWeek(selectedDate, anchorDate)
		? anchorDate
		: selectedDate;
	const weekRange = useMemo(
		() => buildWeekRange(normalizedAnchorDate),
		[normalizedAnchorDate],
	);
	const [error, setError] = useState("");
	const [taskDraft, setTaskDraft] = useState("");
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
				if (!isMissingFileError(cause)) throw cause;
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
					if (!isMissingFileError(cause)) throw cause;
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

	const agendaTasks = data?.tasks.for_day ?? [];
	const overdueTasks = data?.tasks.overdue ?? [];
	const ongoingTasks = data?.tasks.ongoing ?? [];
	const noteActivity = data?.detail.note_activity ?? [];
	const selectedDateObj = useMemo(
		() => parseCalendarDate(selectedDate),
		[selectedDate],
	);
	const selectedHeading = useMemo(
		() => format(selectedDateObj, "EEEE, MMMM d"),
		[selectedDateObj],
	);
	const selectedMonth = selectedMonthLabel(selectedDate);
	const renderTaskGroup = useCallback(
		(label: string, tasks: TaskItem[]) => {
			if (tasks.length === 0) return null;
			const { displayLabel } = getTaskGroupMeta(label);
			return (
				<div>
					<div className="calendarSectionHeader">
						<h4 className="calendarSectionTitle">
							<span>{displayLabel}</span>
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

	return (
		<div className="calendarPaneOuter">
			<section className="calendarPane">
				<div className="calendarNativePanel">
					<header className="calendarNativeTitlebar">
						<div className="calendarNativeTitleBlock">
							<h2 className="calendarNativeTitle">
								{weekTitle(weekRange.dates)}
							</h2>
						</div>
						<div className="calendarNativeActions">
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
									size={13}
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
									size={14}
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
									size={13}
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
									size={16}
									strokeWidth={0.9}
								/>
							</Button>
						</div>
					</header>

					<div className="calendarWeekHeader">
						<div className="calendarWeekMonth">
							<span>{selectedMonth.month}</span>
							<small>{selectedMonth.year}</small>
						</div>
						<div
							className="calendarWeekStrip"
							aria-label={weekTitle(weekRange.dates)}
						>
							{weekRange.dates.map((date) => {
								const parsed = parseCalendarDate(date);
								const isSelected = date === selectedDate;
								return (
									<button
										key={date}
										type="button"
										className="calendarWeekDay"
										data-selected={isSelected ? "true" : undefined}
										onClick={() => selectDay(date)}
									>
										<span>{format(parsed, "EEEEE")}</span>
										<strong>{format(parsed, "d")}</strong>
									</button>
								);
							})}
						</div>
					</div>

					{error || calendarQuery.error ? (
						<div className="calendarError">
							{error ||
								(calendarQuery.error instanceof Error
									? calendarQuery.error.message
									: String(calendarQuery.error))}
						</div>
					) : null}

					<section className="calendarPanelSection">
						<div className="calendarPanelSectionHeader">
							<h3>Notes</h3>
							<div className="calendarPanelHeaderActions">
								<span>{selectedHeading}</span>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									className="sidebarTopIconButton"
									onClick={() => void openSelectedDailyNote()}
									aria-label={`Open or create note for ${format(selectedDateObj, "MMM d")}`}
									title={`Open or create note for ${format(selectedDateObj, "MMM d")}`}
								>
									<HugeiconsIcon icon={NoteIcon} size={13} strokeWidth={0.9} />
								</Button>
							</div>
						</div>
						<ul className="calendarNotesList">
							{noteActivity.length === 0 ? (
								<li className="calendarEmptyRow">No notes for this day</li>
							) : null}
							{noteActivity.map((note) => (
								<li key={note.note_id}>
									<button
										type="button"
										className="calendarNoteRow"
										onClick={() => void onOpenFile(note.note_path)}
										onMouseEnter={() => prefetchNote(note.note_path)}
										onFocus={() => prefetchNote(note.note_path)}
									>
										<span>
											<HugeiconsIcon
												icon={NoteIcon}
												size={14}
												strokeWidth={0.9}
											/>
										</span>
										<span className="calendarNoteTitle">{noteTitle(note)}</span>
										<span className="calendarNoteTime">
											{noteTimeLabel(note)}
										</span>
									</button>
								</li>
							))}
						</ul>
					</section>

					<section className="calendarPanelSection calendarTasksSection">
						<div className="calendarPanelSectionHeader">
							<h3>Tasks</h3>
						</div>
						<div className="calendarTasksScrollArea">
							{renderTaskGroup("For this day", agendaTasks)}
							{renderTaskGroup("Overdue", overdueTasks)}
							{renderTaskGroup("Ongoing", ongoingTasks)}
							{agendaTasks.length === 0 &&
							overdueTasks.length === 0 &&
							ongoingTasks.length === 0 ? (
								<div className="calendarEmptyRow">No tasks for this day</div>
							) : null}
						</div>

						{dailyNotesFolder ? (
							<div className="calendarTaskComposer">
								<span>+</span>
								<Input
									value={taskDraft}
									onChange={(event) => setTaskDraft(event.target.value)}
									placeholder="New task..."
									onKeyDown={(event) => {
										if (event.key === "Enter" && !event.shiftKey) {
											event.preventDefault();
											void submitTask();
										}
									}}
								/>
								<Button
									type="button"
									size="icon-xs"
									variant="ghost"
									className="sidebarTopIconButton"
									onClick={() => void submitTask()}
									disabled={submitTaskMutation.isPending || !taskDraft.trim()}
									aria-label="Add task"
								>
									<HugeiconsIcon
										icon={TaskAdd02Icon}
										size={14}
										strokeWidth={0.9}
									/>
								</Button>
							</div>
						) : (
							<div className="calendarInlineSetup">
								<span>Set a daily notes folder to add tasks here.</span>
								<Button
									type="button"
									variant="ghost"
									size="xs"
									onClick={onOpenDailyNotesSettings}
								>
									<Settings size={13} />
									Settings
								</Button>
							</div>
						)}
					</section>

					{loading ? (
						<div className="calendarLoading">Refreshing...</div>
					) : null}
				</div>
			</section>
		</div>
	);
}
