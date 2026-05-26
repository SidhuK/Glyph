import {
	AlertCircleIcon,
	ArrowLeftBigIcon,
	ArrowRightBigIcon,
	Calendar03Icon,
	MoreHorizontalIcon,
	NoteIcon,
	Task01Icon,
	TaskAdd02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	useFileTreeContext,
	useSpace,
	useUILayoutContext,
} from "../../contexts";
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
import {
	DEFAULT_TAG_ICON_NAME,
	resolveTagIconName,
	tagIconOverridesFromAppearance,
} from "../../lib/tagIcons";
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
import { DatabaseColumnIcon } from "../database/DatabaseColumnIcon";
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

function countLabel(count: number, singular: string, plural = `${singular}s`) {
	return `${count} ${count === 1 ? singular : plural}`;
}

type TaskFocusGroupKey = "overdue" | "today" | "ongoing" | "later";

interface TaskFocusGroup {
	key: TaskFocusGroupKey;
	label: string;
	tasks: TaskItem[];
	count?: number;
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
	const taskInputRef = useRef<HTMLInputElement>(null);
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

	const focusTaskInput = useCallback(() => {
		window.requestAnimationFrame(() => taskInputRef.current?.focus());
	}, []);

	const appendTaskDraftToken = useCallback(
		(token: string) => {
			const trimmedToken = token.trim();
			if (!trimmedToken) return;
			setTaskDraft((draft) => {
				if (draft.includes(trimmedToken)) return draft;
				const trimmedDraft = draft.trimEnd();
				return trimmedDraft ? `${trimmedDraft} ${trimmedToken}` : trimmedToken;
			});
			focusTaskInput();
		},
		[focusTaskInput],
	);

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

	const openTodayDailyNote = useCallback(async () => {
		goToToday();
		await openDailyNoteForDate(today);
	}, [goToToday, openDailyNoteForDate, today]);

	const focusTodayTaskComposer = useCallback(() => {
		if (!dailyNotesFolder) {
			onOpenDailyNotesSettings();
			return;
		}
		goToToday();
		window.requestAnimationFrame(() => taskInputRef.current?.focus());
	}, [dailyNotesFolder, goToToday, onOpenDailyNotesSettings]);

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
	const laterTaskCount = useMemo(
		() =>
			(data?.days ?? []).reduce(
				(total, day) =>
					day.date > selectedDate ? total + day.task_count : total,
				0,
			),
		[data?.days, selectedDate],
	);
	const weekTaskCount = useMemo(
		() => (data?.days ?? []).reduce((total, day) => total + day.task_count, 0),
		[data?.days],
	);
	const weekNoteCount = useMemo(
		() =>
			(data?.days ?? []).reduce(
				(total, day) => total + day.note_activity_count,
				0,
			),
		[data?.days],
	);
	const weekDailyNoteCount = useMemo(
		() => (data?.days ?? []).filter((day) => day.has_daily_note).length,
		[data?.days],
	);
	const daySummariesByDate = useMemo(
		() => new Map((data?.days ?? []).map((day) => [day.date, day])),
		[data?.days],
	);
	const selectedDateObj = useMemo(
		() => parseCalendarDate(selectedDate),
		[selectedDate],
	);
	const selectedHeading = useMemo(
		() => format(selectedDateObj, "EEEE, MMMM d"),
		[selectedDateObj],
	);
	const selectedMonth = selectedMonthLabel(selectedDate);
	const focusDayLabel =
		selectedDate === today ? "Today" : format(selectedDateObj, "MMM d");
	const taskFocusGroups = useMemo<TaskFocusGroup[]>(
		() => [
			{ key: "overdue", label: "Overdue", tasks: overdueTasks },
			{ key: "today", label: focusDayLabel, tasks: agendaTasks },
			{ key: "ongoing", label: "Ongoing", tasks: ongoingTasks },
			{ key: "later", label: "Later", tasks: [], count: laterTaskCount },
		],
		[agendaTasks, focusDayLabel, laterTaskCount, ongoingTasks, overdueTasks],
	);
	const visibleTaskGroups = useMemo(
		() =>
			taskFocusGroups.filter(
				(group) =>
					group.key === "today" || group.tasks.length > 0 || group.count,
			),
		[taskFocusGroups],
	);
	const renderTaskGroup = useCallback(
		(group: TaskFocusGroup) => {
			const { displayLabel } = getTaskGroupMeta(group.label);
			const count = group.count ?? group.tasks.length;
			return (
				<div className="calendarTaskGroup" data-kind={group.key}>
					<div className="calendarSectionHeader calendarTaskGroupHeader">
						<h4 className="calendarSectionTitle calendarTaskGroupTitle">
							<span>{displayLabel}</span>
						</h4>
						<span className="calendarSectionCount">
							{countLabel(count, "task")}
						</span>
					</div>
					<div className="calendarTaskList">
						{group.tasks.length === 0 ? (
							<div className="calendarEmptyRow calendarTaskGroupEmpty">
								{group.key === "later"
									? "Later tasks are counted from this week."
									: "No tasks for this day"}
							</div>
						) : null}
						{group.tasks.map((task) => (
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
									size={13}
									strokeWidth={0.9}
								/>
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								className="sidebarTopIconButton calendarAccentIconButton"
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

					{error || calendarQuery.error ? (
						<div className="calendarError">
							{error ||
								(calendarQuery.error instanceof Error
									? calendarQuery.error.message
									: String(calendarQuery.error))}
						</div>
					) : null}

					<section
						className="calendarCommandBar"
						aria-label="Home quick actions"
					>
						<div className="calendarCommandTitle">
							<h3>Home / Today</h3>
						</div>
						<div className="calendarCommandActions">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="calendarAccentButton"
								onClick={() => void openTodayDailyNote()}
							>
								<HugeiconsIcon icon={NoteIcon} size={14} strokeWidth={0.9} />
								Open daily note
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="calendarAccentButton"
								onClick={focusTodayTaskComposer}
							>
								<HugeiconsIcon
									icon={TaskAdd02Icon}
									size={14}
									strokeWidth={0.9}
								/>
								New task
							</Button>
						</div>
					</section>

					<section className="calendarWeekPanel">
						<div className="calendarWeekHeader">
							<div className="calendarWeekMonth">
								<span>{selectedMonth.month}</span>
								<small>{selectedMonth.year}</small>
							</div>
							<div className="calendarWeekStats" aria-label="Week summary">
								<span>
									<strong>{weekNoteCount}</strong>
									notes
								</span>
								<span>
									<strong>{weekTaskCount}</strong>
									tasks
								</span>
								<span>
									<strong>{weekDailyNoteCount}</strong>
									daily notes
								</span>
							</div>
						</div>
						<div
							className="calendarWeekStrip"
							aria-label={weekTitle(weekRange.dates)}
						>
							{weekRange.dates.map((date) => {
								const parsed = parseCalendarDate(date);
								const isSelected = date === selectedDate;
								const summary = daySummariesByDate.get(date);
								const taskCount = summary?.task_count ?? 0;
								const noteActivityCount = summary?.note_activity_count ?? 0;
								const hasDailyNote = summary?.has_daily_note ?? false;
								const overdueCount = isSelected ? overdueTasks.length : 0;
								const signalLabels = [
									taskCount > 0 ? countLabel(taskCount, "task") : null,
									noteActivityCount > 0
										? countLabel(noteActivityCount, "note")
										: null,
									hasDailyNote ? "daily note" : null,
									overdueCount > 0
										? countLabel(overdueCount, "overdue task")
										: null,
								].filter((label): label is string => Boolean(label));
								const dayLabel = format(parsed, "EEEE, MMM d");
								return (
									<div
										key={date}
										className="calendarWeekDay"
										data-selected={isSelected ? "true" : undefined}
									>
										<button
											type="button"
											className="calendarWeekDayButton"
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
										{signalLabels.length > 0 ? (
											<details className="calendarWeekDetails">
												<summary
													className="calendarWeekSignals"
													aria-label={`${dayLabel} workload details`}
													title={signalLabels.join(", ")}
												>
													{taskCount > 0 ? (
														<span className="calendarWeekSignal calendarWeekTaskSignal">
															<HugeiconsIcon
																icon={Task01Icon}
																size={11}
																strokeWidth={1.15}
																aria-hidden
															/>
															<span className="calendarWeekSignalCount">
																{taskCount}
															</span>
														</span>
													) : null}
													{noteActivityCount > 0 ? (
														<span className="calendarWeekSignal calendarWeekNoteSignal">
															<HugeiconsIcon
																icon={NoteIcon}
																size={11}
																strokeWidth={1.15}
																aria-hidden
															/>
															<span className="calendarWeekSignalCount">
																{noteActivityCount}
															</span>
														</span>
													) : null}
													{hasDailyNote ? (
														<span className="calendarWeekSignal calendarWeekDailySignal">
															<HugeiconsIcon
																icon={Calendar03Icon}
																size={11}
																strokeWidth={1.15}
																aria-hidden
															/>
														</span>
													) : null}
													{overdueCount > 0 ? (
														<span className="calendarWeekSignal calendarWeekOverdueSignal">
															<HugeiconsIcon
																icon={AlertCircleIcon}
																size={11}
																strokeWidth={1.15}
																aria-hidden
															/>
															<span className="calendarWeekSignalCount">
																{overdueCount}
															</span>
														</span>
													) : null}
												</summary>
												<div className="calendarWeekDetailsPanel">
													{signalLabels.map((label) => (
														<span key={label}>{label}</span>
													))}
												</div>
											</details>
										) : (
											<span
												className="calendarWeekSignals"
												aria-hidden="true"
											/>
										)}
									</div>
								);
							})}
						</div>
					</section>

					<div className="calendarDashboardContent">
						<section className="calendarPanelSection calendarNotesSection">
							<div className="calendarPanelSectionHeader">
								<div>
									<h3>Notes</h3>
									<span>
										{countLabel(noteActivity.length, "note")} for this day
									</span>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									className="sidebarTopIconButton calendarAccentIconButton"
									onClick={() => void openSelectedDailyNote()}
									aria-label={`Open or create note for ${format(selectedDateObj, "MMM d")}`}
									title={`Open or create note for ${format(selectedDateObj, "MMM d")}`}
								>
									<HugeiconsIcon icon={NoteIcon} size={13} strokeWidth={0.9} />
								</Button>
							</div>
							<ul className="calendarNotesList">
								{noteActivity.length === 0 ? (
									<li className="calendarEmptyRow">No notes for this day</li>
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
														size={14}
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
																				size={10}
																				strokeWidth={1.2}
																			/>
																		) : null}
																		#{tag}
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

						<section className="calendarPanelSection calendarTasksSection">
							<div className="calendarPanelSectionHeader">
								<div>
									<h3>Tasks</h3>
									<span>
										{countLabel(
											agendaTasks.length +
												overdueTasks.length +
												ongoingTasks.length +
												laterTaskCount,
											"task",
										)}{" "}
										in view
									</span>
								</div>
							</div>
							<div className="calendarTasksScrollArea">
								{visibleTaskGroups.map((group) => (
									<div key={group.key}>{renderTaskGroup(group)}</div>
								))}
							</div>

							{dailyNotesFolder ? (
								<div className="calendarTaskComposer">
									<div className="calendarTaskComposerMain">
										<span
											className="calendarTaskComposerIcon"
											aria-hidden="true"
										>
											<HugeiconsIcon
												icon={TaskAdd02Icon}
												size={14}
												strokeWidth={0.9}
											/>
										</span>
										<Input
											ref={taskInputRef}
											value={taskDraft}
											onChange={(event) => setTaskDraft(event.target.value)}
											placeholder="Add a task..."
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
											className="sidebarTopIconButton calendarAccentIconButton"
											onClick={() => void submitTask()}
											disabled={
												submitTaskMutation.isPending || !taskDraft.trim()
											}
											aria-label="Add task"
										>
											<HugeiconsIcon
												icon={TaskAdd02Icon}
												size={14}
												strokeWidth={0.9}
											/>
										</Button>
									</div>
									<div
										className="calendarTaskComposerChips"
										aria-label="Task capture options"
									>
										<Button
											type="button"
											size="xs"
											variant="ghost"
											className="calendarTaskComposerChip"
											data-active={selectedDate === today ? "true" : undefined}
											onClick={() => {
												goToToday();
												focusTaskInput();
											}}
										>
											Today
										</Button>
										<Button
											type="button"
											size="xs"
											variant="ghost"
											className="calendarTaskComposerChip"
											onClick={focusTaskInput}
										>
											Due {format(selectedDateObj, "MMM d")}
										</Button>
										<Button
											type="button"
											size="xs"
											variant="ghost"
											className="calendarTaskComposerChip"
											onClick={() => appendTaskDraftToken("#priority")}
										>
											Priority
										</Button>
										<Button
											type="button"
											size="xs"
											variant="ghost"
											className="calendarTaskComposerChip"
											onClick={() => appendTaskDraftToken("#inbox")}
										>
											Inbox
										</Button>
									</div>
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
					</div>

					{loading ? (
						<div className="calendarLoading">Refreshing...</div>
					) : null}
				</div>
			</section>
		</div>
	);
}
