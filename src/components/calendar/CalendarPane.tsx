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
	formatDayTitle,
	formatMonthDay,
	formatMonthTitle,
	formatWeekday,
	insertTaskIntoDailyNote,
	isDateInMonth,
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

function getTaskGroupMeta(label: string): {
	displayLabel: string;
	tone: "danger" | "info" | "warning" | "neutral";
} {
	if (label === "Overdue") {
		return { displayLabel: "Overdue", tone: "danger" };
	}
	if (label === "For this day") {
		return { displayLabel: "Today", tone: "info" };
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
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [taskDraft, setTaskDraft] = useState("");
	const [isSubmittingTask, setIsSubmittingTask] = useState(false);
	const loadRequestIdRef = useRef(0);
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

	useEffect(() => {
		void loadCalendar();
	}, [loadCalendar]);

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
		loadCalendar,
		onOpenDailyNotesSettings,
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

	const openSelectedDailyNote = useCallback(async () => {
		if (!dailyNotesFolder) {
			onOpenDailyNotesSettings();
			return;
		}
		await openOrCreateDailyNoteAtDate(dailyNotesFolder, selectedDate);
		await loadCalendar();
	}, [
		dailyNotesFolder,
		loadCalendar,
		onOpenDailyNotesSettings,
		openOrCreateDailyNoteAtDate,
		selectedDate,
	]);

	const renderTaskGroup = useCallback(
		(label: string, tasks: TaskItem[], scrollClassName: string) => {
			const { displayLabel, tone } = getTaskGroupMeta(label);
			return (
				<section className="calendarSection calendarTaskGroupCard">
					<div className="calendarSectionHeader">
						<h3 className="calendarSectionTitle">
							<span className={cn("calendarSectionLabelPill", `is-${tone}`)}>
								{displayLabel}
							</span>
						</h3>
						<span className="calendarSectionCount">{tasks.length}</span>
					</div>
					<div className={cn("calendarSectionScroller", scrollClassName)}>
						{tasks.length > 0 ? (
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
						) : null}
					</div>
				</section>
			);
		},
		[onOpenFile, scheduleTask, selectedDate, toggleTask],
	);

	return (
		<section className="calendarPane">
			<div className="calendarToolbar">
				<div className="calendarTitleRow">
					<Calendar size={27} />
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
				<div className="calendarPrimary">
					{viewMode === "month" ? (
						<div className="calendarMonthGrid">
							{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
								<div key={day} className="calendarMonthWeekday">
									{day}
								</div>
							))}
							{range.dates.map((date) => {
								const summary = summaryByDate.get(date);
								const isToday = date === today;
								const isSelected = date === selectedDate;
								return (
									<button
										key={date}
										type="button"
										className={cn(
											"calendarMonthCell",
											!isDateInMonth(date, anchorDate) && "is-outside",
											isToday && "is-today",
											isSelected && "is-selected",
										)}
										onClick={() => setSelectedDate(date)}
									>
										<div className="calendarMonthCellHead">
											{isToday ? (
												<span className="calendarMonthCellTodayWatermark">
													Today
												</span>
											) : null}
											<span className="calendarMonthCellDayNumber">
												{formatMonthDay(date)}
											</span>
											{isToday ? <span className="calendarTodayDot" /> : null}
										</div>
										<div className="calendarMonthCellMeta">
											{summary?.task_count ? (
												<span
													className="calendarMonthCellStatLine"
													aria-label={`${summary.task_count} tasks`}
												>
													<ListChecks size={12} />
													<span>
														{summary.task_count}{" "}
														{summary.task_count === 1 ? "task" : "tasks"}
													</span>
												</span>
											) : null}
											{summary?.note_activity_count ? (
												<span
													className="calendarMonthCellStatLine"
													aria-label={`${summary.note_activity_count} notes`}
												>
													<StickyNote size={12} />
													<span>
														{summary.note_activity_count}{" "}
														{summary.note_activity_count === 1
															? "note"
															: "notes"}
													</span>
												</span>
											) : null}
											{summary?.has_daily_note ? (
												<span
													className="calendarMonthCellStatLine"
													aria-label="Daily note"
												>
													<FileText size={12} />
													<span>Daily note</span>
												</span>
											) : null}
										</div>
									</button>
								);
							})}
						</div>
					) : (
						<div className="calendarWeekStack">
							{range.dates.map((date) => {
								const summary = summaryByDate.get(date);
								const isSelected = date === selectedDate;
								return (
									<div
										key={date}
										className={cn(
											"calendarWeekCard",
											isSelected && "is-selected",
										)}
									>
										<button
											type="button"
											className="calendarWeekCardButton"
											onClick={() => setSelectedDate(date)}
										>
											<div className="calendarWeekCardMain">
												<div className="calendarWeekCardTitle">
													{formatDayTitle(date)}
												</div>
												<div className="calendarWeekCardSubtext">
													{relativeDayLabel(date, today) ?? formatWeekday(date)}
												</div>
											</div>
											<div className="calendarWeekCardSummary">
												{summary?.task_count ? (
													<span
														className="calendarMonthCellStatLine"
														aria-label={`${summary.task_count} tasks`}
													>
														<ListChecks size={12} />
														<span>
															{summary.task_count}{" "}
															{summary.task_count === 1 ? "task" : "tasks"}
														</span>
													</span>
												) : null}
												{summary?.note_activity_count ? (
													<span
														className="calendarMonthCellStatLine"
														aria-label={`${summary.note_activity_count} notes`}
													>
														<StickyNote size={12} />
														<span>
															{summary.note_activity_count}{" "}
															{summary.note_activity_count === 1
																? "note"
																: "notes"}
														</span>
													</span>
												) : null}
												{summary?.has_daily_note ? (
													<span
														className="calendarMonthCellStatLine"
														aria-label="Daily note"
													>
														<FileText size={12} />
														<span>Daily note</span>
													</span>
												) : null}
											</div>
										</button>
									</div>
								);
							})}
						</div>
					)}
				</div>

				<aside className="calendarDetailPane">
					<div className="calendarDetailHeader">
						<div className="calendarDetailHeading">
							<h3 className="calendarDetailTitle">
								{formatDayTitle(selectedDate)}
							</h3>
							<div className="calendarDetailSubtext">
								{relativeDayLabel(selectedDate, today) ??
									formatWeekday(selectedDate)}
							</div>
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
					<div className="calendarDetailBody">
						<section className="calendarSection calendarSectionCard">
							<div className="calendarSectionHeader">
								<h3 className="calendarSectionTitle">
									<span className="calendarSectionLabelPill">Tasks</span>
								</h3>
							</div>
							{dailyNotesFolder ? (
								<div className="calendarTaskComposer">
									<Input
										value={taskDraft}
										onChange={(event) => setTaskDraft(event.target.value)}
										placeholder={`Add a task for ${formatDayTitle(selectedDate)}`}
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
							<div className="calendarTaskGroups">
								{renderTaskGroup(
									"Overdue",
									selectedTasks?.overdue ?? [],
									"calendarSectionScroller-compact",
								)}
								{renderTaskGroup(
									"For this day",
									selectedTasks?.for_day ?? [],
									"calendarSectionScroller-main",
								)}
								{renderTaskGroup(
									"Ongoing",
									selectedTasks?.ongoing ?? [],
									"calendarSectionScroller-compact",
								)}
							</div>
						</section>

						<section className="calendarSection calendarSectionCard calendarNotesSection">
							<div className="calendarSectionHeader">
								<h3 className="calendarSectionTitle">
									<span className="calendarSectionLabelPill">Notes</span>
								</h3>
								<span className="calendarSectionCount">
									{data?.detail.note_activity.length ?? 0}
								</span>
							</div>
							<div className="calendarNotesScroller">
								{data?.detail.note_activity.length ? (
									<div className="calendarNotesList">
										{data.detail.note_activity.map((item) => (
											<button
												key={item.note_id}
												type="button"
												className="calendarNoteRow"
												onClick={() => void onOpenFile(item.note_path)}
											>
												<div className="calendarNoteRowMain">
													<div className="calendarNoteTitleLine">
														<div className="calendarNoteTitle">
															{item.title}
														</div>
														{getNoteBreadcrumb(item.note_path) ? (
															<div className="calendarNotePath">
																{getNoteBreadcrumb(item.note_path)}
															</div>
														) : null}
													</div>
												</div>
												<div className="calendarNoteBadges">
													{item.edited_on_day ? (
														<span className="calendarMetaPill is-muted">
															{formatActivityTime(item.updated)}
														</span>
													) : null}
												</div>
											</button>
										))}
									</div>
								) : (
									<div className="calendarEmptyText">
										No note activity recorded for this day.
									</div>
								)}
							</div>
						</section>

						<section className="calendarSection calendarSectionCard">
							<div className="calendarSectionHeader">
								<h3 className="calendarSectionTitle">
									<span className="calendarSectionLabelPill">Daily note</span>
								</h3>
							</div>
							<div className="calendarDailyNoteWrap">
								{data?.detail.daily_note_configured ? (
									<div className="calendarDailyNoteCard calendarDailyNoteCardCompact">
										<div>
											<div className="calendarDailyNoteTitle">
												{data.detail.has_daily_note
													? "Daily note"
													: "Create daily note"}
											</div>
											<div className="calendarDailyNotePath">
												{data.detail.daily_note_path ??
													getDailyNotePath(
														dailyNotesFolder ?? "",
														selectedDate,
													)}
											</div>
										</div>
										<Button
											type="button"
											size="sm"
											variant={
												data.detail.has_daily_note ? "outline" : "default"
											}
											onClick={openSelectedDailyNote}
										>
											{data.detail.has_daily_note
												? "Open daily note"
												: "Create daily note"}
										</Button>
									</div>
								) : (
									<div className="calendarInlineSetup">
										<div>
											Daily notes are not configured for this space yet.
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
							</div>
						</section>
					</div>
				</aside>
			</div>

			{loading ? (
				<div className="calendarLoading">Refreshing calendar…</div>
			) : null}
		</section>
	);
}

export default CalendarPane;
