import { cn } from "@/lib/utils";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSpace, useUILayoutContext } from "../../contexts";
import { useDailyNote } from "../../hooks/useDailyNote";
import {
	CALENDAR_SYSTEM_CREATED_KEY,
	buildMonthGridDates,
	endOfMonthGrid,
	formatMonthLabel,
	getWeekdayLabels,
	groupCalendarItemsByDate,
	isoDateFromLocalDate,
	parseIsoDate,
	pickDefaultNoteDateProperty,
	startOfMonth,
	startOfMonthGrid,
} from "../../lib/calendar";
import type {
	CalendarItem,
	CalendarMode,
	CalendarNoteDateProperty,
	CalendarSource,
} from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { Calendar as CalendarIcon, ChevronRight, RefreshCw } from "../Icons";
import { Toggle } from "../base/toggle/toggle";
import { DatabaseFolderPicker } from "../database/DatabaseFolderPicker";
import { SettingsSegmented } from "../settings/SettingsScaffold";
import { Button } from "../ui/shadcn/button";
import { CalendarMonthAdapter } from "./CalendarMonthAdapter";

interface CalendarPaneProps {
	onOpenFile: (relPath: string) => void | Promise<void>;
	onClosePane?: () => void;
}

const FULL_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
	weekday: "long",
	month: "long",
	day: "numeric",
	year: "numeric",
});

const MONTH_TRANSITION = {
	duration: 0.22,
	ease: [0.22, 1, 0.36, 1] as const,
};

function todayIsoDate() {
	return isoDateFromLocalDate(new Date());
}

function notePropertyValue(
	property: CalendarNoteDateProperty | null,
): `${string}::${string}` | "" {
	if (!property) return "";
	return `${property.key}::${property.kind}`;
}

function parseNotePropertySelection(
	value: string,
	properties: CalendarNoteDateProperty[],
): CalendarNoteDateProperty | null {
	if (!value) return null;
	const [key, kind] = value.split("::");
	if (!key || (kind !== "date" && kind !== "datetime")) return null;
	return (
		properties.find(
			(property) => property.key === key && property.kind === kind,
		) ?? null
	);
}

function notePropertyLabel(property: CalendarNoteDateProperty): string {
	if (property.key === CALENDAR_SYSTEM_CREATED_KEY) {
		return "Created";
	}
	return property.key;
}

function calendarModeCopy(mode: CalendarMode) {
	if (mode === "daily_notes") {
		return {
			eyebrow: "Daily rhythm",
			description: "A gentle map of your day-by-day writing cadence.",
			loading: "Gathering daily notes…",
			emptyTitle: "Daily notes are not configured",
			emptyBody: "Set a daily notes folder in Settings before using this mode.",
			agendaEmpty: "Nothing landed on this day yet.",
		};
	}
	if (mode === "tasks") {
		return {
			eyebrow: "Plans in motion",
			description: "Deadlines, starts, and open loops in one calmer view.",
			loading: "Sorting due dates and scheduled work…",
			emptyTitle: "",
			emptyBody: "",
			agendaEmpty: "No tasks are scheduled for this day.",
		};
	}
	return {
		eyebrow: "Notes in time",
		description: "Trace ideas across the month and reopen threads at a glance.",
		loading: "Placing notes on the calendar…",
		emptyTitle: "No note date fields yet",
		emptyBody:
			"Add a frontmatter property with a YYYY-MM-DD value or an ISO datetime to start placing notes on the calendar.",
		agendaEmpty: "No notes are pinned to this day yet.",
	};
}

function summarizeItems(items: CalendarItem[]) {
	let notes = 0;
	let dailyNotes = 0;
	let tasks = 0;
	const activeDays = new Set<string>();
	for (const item of items) {
		activeDays.add(item.date);
		if (item.kind === "task") {
			tasks += 1;
			continue;
		}
		if (item.kind === "daily_note") {
			dailyNotes += 1;
			continue;
		}
		notes += 1;
	}
	return {
		notes,
		dailyNotes,
		tasks,
		total: items.length,
		activeDays: activeDays.size,
	};
}

export function CalendarPane({ onOpenFile, onClosePane }: CalendarPaneProps) {
	const { setError } = useSpace();
	const { dailyNotesFolder } = useUILayoutContext();
	const { openOrCreateDailyNoteAtDate, isCreating } = useDailyNote({
		onOpenFile: async (path) => {
			await onOpenFile(path);
		},
		setError,
	});
	const [mode, setMode] = useState<CalendarMode>("notes");
	const [currentMonth, setCurrentMonth] = useState(() =>
		startOfMonth(new Date()),
	);
	const [selectedDate, setSelectedDate] = useState(() => todayIsoDate());
	const [items, setItems] = useState<CalendarItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setLocalError] = useState("");
	const [noteDateProperties, setNoteDateProperties] = useState<
		CalendarNoteDateProperty[]
	>([]);
	const [selectedNoteProperty, setSelectedNoteProperty] =
		useState<CalendarNoteDateProperty | null>(null);
	const [notesScope, setNotesScope] = useState<"space" | "folder">("space");
	const [notesFolder, setNotesFolder] = useState("");
	const [notesRecursive, setNotesRecursive] = useState(true);
	const [tasksScope, setTasksScope] = useState<
		"space" | "folder" | "daily_notes"
	>("space");
	const [tasksFolder, setTasksFolder] = useState("");
	const [tasksRecursive, setTasksRecursive] = useState(true);
	const requestIdRef = useRef(0);
	const shouldReduceMotion = useReducedMotion();

	const monthDates = useMemo(
		() => buildMonthGridDates(currentMonth),
		[currentMonth],
	);
	const weekdayLabels = useMemo(() => getWeekdayLabels(), []);
	const rangeStart = useMemo(
		() => isoDateFromLocalDate(startOfMonthGrid(currentMonth)),
		[currentMonth],
	);
	const rangeEnd = useMemo(
		() => isoDateFromLocalDate(endOfMonthGrid(currentMonth)),
		[currentMonth],
	);
	const itemsByDate = useMemo(() => groupCalendarItemsByDate(items), [items]);
	const selectedDayItems = itemsByDate.get(selectedDate) ?? [];
	const selectedDateLabel = useMemo(() => {
		const parsed = parseIsoDate(selectedDate);
		return parsed ? FULL_DATE_FORMATTER.format(parsed) : selectedDate;
	}, [selectedDate]);
	const calendarCopy = useMemo(() => calendarModeCopy(mode), [mode]);
	const monthSummary = useMemo(() => summarizeItems(items), [items]);
	const selectedDateSummary = useMemo(
		() => summarizeItems(selectedDayItems),
		[selectedDayItems],
	);
	const monthKey = useMemo(
		() => `${currentMonth.getFullYear()}-${currentMonth.getMonth()}`,
		[currentMonth],
	);

	const source = useMemo<CalendarSource>(() => {
		if (mode === "daily_notes") {
			return { kind: "daily_notes" };
		}
		if (mode === "notes") {
			if (notesScope === "folder") {
				return {
					kind: "folder",
					path: notesFolder,
					recursive: notesRecursive,
				};
			}
			return { kind: "space" };
		}
		if (tasksScope === "daily_notes") {
			return { kind: "daily_notes" };
		}
		if (tasksScope === "folder") {
			return {
				kind: "folder",
				path: tasksFolder,
				recursive: tasksRecursive,
			};
		}
		return { kind: "space" };
	}, [
		mode,
		notesFolder,
		notesRecursive,
		notesScope,
		tasksFolder,
		tasksRecursive,
		tasksScope,
	]);

	const canOpenDailyNotes = Boolean(dailyNotesFolder);

	const loadCalendar = useCallback(async () => {
		const requestId = ++requestIdRef.current;
		setLoading(true);
		setLocalError("");
		try {
			const result = await invoke("calendar_query", {
				request: {
					mode,
					source,
					start_date: rangeStart,
					end_date: rangeEnd,
					note_date_property_key:
						mode === "notes" ? (selectedNoteProperty?.key ?? null) : null,
					note_date_property_kind:
						mode === "notes" ? (selectedNoteProperty?.kind ?? null) : null,
					daily_notes_folder: dailyNotesFolder,
				},
			});
			if (requestId !== requestIdRef.current) return;
			setItems(result.items);
			setNoteDateProperties(result.note_date_properties);
			if (mode === "notes") {
				const nextSelected = pickDefaultNoteDateProperty(
					result.note_date_properties,
					selectedNoteProperty?.key ?? null,
					selectedNoteProperty?.kind ?? null,
				);
				if (
					nextSelected &&
					(!selectedNoteProperty ||
						nextSelected.key !== selectedNoteProperty.key ||
						nextSelected.kind !== selectedNoteProperty.kind)
				) {
					setSelectedNoteProperty(nextSelected);
				}
				if (!nextSelected && selectedNoteProperty) {
					setSelectedNoteProperty(null);
				}
			}
		} catch (cause) {
			if (requestId !== requestIdRef.current) return;
			setItems([]);
			setNoteDateProperties([]);
			setLocalError(
				cause instanceof Error ? cause.message : "Failed to load calendar",
			);
		} finally {
			if (requestId === requestIdRef.current) {
				setLoading(false);
			}
		}
	}, [
		dailyNotesFolder,
		mode,
		rangeEnd,
		rangeStart,
		selectedNoteProperty,
		source,
	]);

	useEffect(() => {
		void loadCalendar();
	}, [loadCalendar]);

	useEffect(() => {
		const parsedSelected = parseIsoDate(selectedDate);
		if (
			parsedSelected &&
			monthDates.some((date) => isoDateFromLocalDate(date) === selectedDate)
		) {
			return;
		}
		setSelectedDate(isoDateFromLocalDate(currentMonth));
	}, [currentMonth, monthDates, selectedDate]);

	useTauriEvent("space:fs_changed", () => {
		void loadCalendar();
	});
	useTauriEvent("notes:external_changed", () => {
		void loadCalendar();
	});
	useTauriEvent("settings:updated", (payload) => {
		if (payload.dailyNotes || payload.tasks) {
			void loadCalendar();
		}
	});

	const openItem = useCallback(
		async (item: CalendarItem) => {
			if (!item.rel_path) return;
			await onOpenFile(item.rel_path);
			if (onClosePane) {
				// Let file-open side effects settle before closing the special pane.
				window.setTimeout(() => onClosePane(), 0);
			}
		},
		[onClosePane, onOpenFile],
	);

	const moveMonth = useCallback((direction: -1 | 1) => {
		setCurrentMonth((current) => {
			const next = new Date(
				current.getFullYear(),
				current.getMonth() + direction,
				1,
			);
			next.setHours(0, 0, 0, 0);
			return next;
		});
	}, []);

	const handleOpenSelectedDailyNote = useCallback(async () => {
		if (!dailyNotesFolder) return;
		await openOrCreateDailyNoteAtDate(dailyNotesFolder, selectedDate);
	}, [dailyNotesFolder, openOrCreateDailyNoteAtDate, selectedDate]);

	const showFolderPicker =
		(mode === "notes" && notesScope === "folder") ||
		(mode === "tasks" && tasksScope === "folder");
	const showRecursiveToggle =
		(mode === "notes" && notesScope === "folder") ||
		(mode === "tasks" && tasksScope === "folder");
	const showNotePropertyPicker = mode === "notes";
	const hasItems = items.length > 0;

	return (
		<section className="calendarPane">
			<div className="calendarShell">
				<div className="calendarHeader">
					{/* ── Toolbar — title + filters + nav in one row ─ */}
					<div className="calendarToolbar">
						<div className="calendarTitleBlock">
							<div className="calendarTitleRow">
								<h2 className="calendarTitle">
									{formatMonthLabel(currentMonth)}
								</h2>
								<span className="calendarMonthBadge">
									<span className="calendarMonthBadgeCount">
										{monthSummary.total}
									</span>
									<span className="calendarMonthBadgeLabel">
										{monthSummary.total === 1 ? "moment" : "moments"}
									</span>
								</span>
							</div>
							<div className="calendarSubtitle">
								{monthSummary.total > 0
									? `${monthSummary.activeDays} active ${
											monthSummary.activeDays === 1 ? "day" : "days"
										} this month.`
									: calendarCopy.description}
							</div>
						</div>

						<div className="calendarFilters">
							<SettingsSegmented<CalendarMode>
								ariaLabel="Calendar mode"
								value={mode}
								onChange={setMode}
								options={[
									{ label: "Notes", value: "notes" },
									{ label: "Daily Notes", value: "daily_notes" },
									{ label: "Tasks", value: "tasks" },
								]}
							/>

							{mode === "notes" ? (
								<SettingsSegmented<"space" | "folder">
									ariaLabel="Notes calendar source"
									value={notesScope}
									onChange={setNotesScope}
									options={[
										{ label: "Whole space", value: "space" },
										{ label: "Folder", value: "folder" },
									]}
								/>
							) : null}

							{mode === "tasks" ? (
								<SettingsSegmented<"space" | "folder" | "daily_notes">
									ariaLabel="Tasks calendar source"
									value={tasksScope}
									onChange={setTasksScope}
									options={[
										{ label: "Whole space", value: "space" },
										{ label: "Folder", value: "folder" },
										{ label: "Daily notes", value: "daily_notes" },
									]}
								/>
							) : null}

							{showNotePropertyPicker ? (
								<select
									className="databaseNativeSelect calendarPropertySelect"
									value={notePropertyValue(selectedNoteProperty)}
									onChange={(event) =>
										setSelectedNoteProperty(
											parseNotePropertySelection(
												event.target.value,
												noteDateProperties,
											),
										)
									}
								>
									<option value="">Date field…</option>
									{noteDateProperties.map((property) => (
										<option
											key={`${property.key}:${property.kind}`}
											value={notePropertyValue(property)}
										>
											{notePropertyLabel(property)}
										</option>
									))}
								</select>
							) : null}

							{showFolderPicker ? (
								<DatabaseFolderPicker
									value={mode === "notes" ? notesFolder : tasksFolder}
									label="Calendar Folder"
									description="Pick the folder to include."
									placeholder="Folder…"
									onChange={(value) => {
										if (mode === "notes") {
											setNotesFolder(value);
											return;
										}
										setTasksFolder(value);
									}}
								/>
							) : null}

							{showRecursiveToggle ? (
								<div className="calendarFilterToggle">
									<Toggle
										slim
										size="sm"
										label="Subfolders"
										checked={mode === "notes" ? notesRecursive : tasksRecursive}
										onCheckedChange={(checked) => {
											if (mode === "notes") {
												setNotesRecursive(checked);
												return;
											}
											setTasksRecursive(checked);
										}}
									/>
								</div>
							) : null}
						</div>

						<div className="calendarNav">
							<div className="calendarNavCluster">
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									className="calendarNavBtn"
									onClick={() => moveMonth(-1)}
									aria-label="Previous month"
								>
									<ChevronRight className="calendarChevronLeft" size={14} />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="calendarNavToday"
									onClick={() => {
										const today = startOfMonth(new Date());
										setCurrentMonth(today);
										setSelectedDate(todayIsoDate());
									}}
								>
									Today
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									className="calendarNavBtn"
									onClick={() => moveMonth(1)}
									aria-label="Next month"
								>
									<ChevronRight size={14} />
								</Button>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="calendarNavBtn calendarNavBtnSolo"
								onClick={() => void loadCalendar()}
								aria-label="Reload calendar"
							>
								<RefreshCw size={14} />
							</Button>
							{mode === "daily_notes" ? (
								<Button
									type="button"
									size="sm"
									className="calendarPrimaryAction"
									disabled={!canOpenDailyNotes || isCreating}
									onClick={() => void handleOpenSelectedDailyNote()}
								>
									<CalendarIcon size={14} />
									Open / Create
								</Button>
							) : null}
						</div>
					</div>

					{/* ── Error ───────────────────────────────────── */}
					{error ? (
						<div className="calendarNotice calendarNoticeError">{error}</div>
					) : null}
				</div>

				{/* ── Month grid ──────────────────────────────── */}
				<div className="calendarPaneMain">
					{loading ? (
						<div className="calendarEmptyState">
							<div className="calendarEmptyEyebrow">{calendarCopy.eyebrow}</div>
							<div className="calendarEmptyTitle">{calendarCopy.loading}</div>
							<div className="calendarEmptyBody">
								{calendarCopy.description}
							</div>
						</div>
					) : mode === "notes" && noteDateProperties.length === 0 ? (
						<div className="calendarEmptyState">
							<div className="calendarEmptyEyebrow">{calendarCopy.eyebrow}</div>
							<div className="calendarEmptyTitle">
								{calendarCopy.emptyTitle}
							</div>
							<div className="calendarEmptyBody">{calendarCopy.emptyBody}</div>
						</div>
					) : mode === "daily_notes" && !canOpenDailyNotes ? (
						<div className="calendarEmptyState">
							<div className="calendarEmptyEyebrow">{calendarCopy.eyebrow}</div>
							<div className="calendarEmptyTitle">
								{calendarCopy.emptyTitle}
							</div>
							<div className="calendarEmptyBody">{calendarCopy.emptyBody}</div>
						</div>
					) : (
						<AnimatePresence mode="wait" initial={false}>
							<m.div
								key={monthKey}
								className="calendarMonthStage"
								initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
								animate={{ opacity: 1, y: 0 }}
								exit={shouldReduceMotion ? {} : { opacity: 0, y: -10 }}
								transition={
									shouldReduceMotion ? { duration: 0 } : MONTH_TRANSITION
								}
							>
								<CalendarMonthAdapter
									dates={monthDates}
									month={currentMonth}
									selectedDate={selectedDate}
									itemsByDate={itemsByDate}
									weekdayLabels={weekdayLabels}
									onSelectDate={setSelectedDate}
									onOpenItem={(item) => void openItem(item)}
								/>
							</m.div>
						</AnimatePresence>
					)}
				</div>

				{/* ── Day details / Agenda ────────────────────── */}
				<div className="calAgenda">
					<div className="calAgendaHeader">
						<div className="calAgendaHeaderCopy">
							<span className="calAgendaDate">{selectedDateLabel}</span>
						</div>
						{selectedDayItems.length > 0 ? (
							<div className="calAgendaBadgeRow">
								{selectedDateSummary.notes > 0 ? (
									<span className="calAgendaBadge is-note">
										{selectedDateSummary.notes} note
										{selectedDateSummary.notes === 1 ? "" : "s"}
									</span>
								) : null}
								{selectedDateSummary.dailyNotes > 0 ? (
									<span className="calAgendaBadge is-daily-note">
										{selectedDateSummary.dailyNotes} daily
									</span>
								) : null}
								{selectedDateSummary.tasks > 0 ? (
									<span className="calAgendaBadge is-task">
										{selectedDateSummary.tasks} task
										{selectedDateSummary.tasks === 1 ? "" : "s"}
									</span>
								) : null}
							</div>
						) : null}
					</div>
					<div className="calAgendaScroller">
						{selectedDayItems.length > 0 ? (
							selectedDayItems.map((item, index) => (
								<m.button
									key={item.id}
									type="button"
									className="calAgendaCard databaseBoardCard"
									onClick={() => void openItem(item)}
									initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									transition={
										shouldReduceMotion
											? { duration: 0 }
											: {
													...MONTH_TRANSITION,
													delay: Math.min(index * 0.025, 0.14),
												}
									}
								>
									<span className="calAgendaCardHead databaseBoardCardHead">
										<span className="calAgendaCardTitle databaseBoardCardTitle">
											{item.title}
										</span>
										<span
											className={cn(
												"calAgendaCardPreview databaseBoardCardPreview",
												item.kind === "task" && "is-task",
												!item.preview && "is-placeholder",
											)}
										>
											{item.preview || "No preview yet"}
										</span>
									</span>
									{item.badges?.length ? (
										<span className="calAgendaCardTags databaseBoardCardTags">
											{item.badges.map((badge) => (
												<span
													key={`${item.id}:${badge}`}
													className="calAgendaCardTag databaseBoardTag"
												>
													{badge}
												</span>
											))}
										</span>
									) : null}
									{item.rel_path ? (
										<span className="calAgendaCardPath databaseBoardCardPath">
											{item.rel_path}
										</span>
									) : null}
								</m.button>
							))
						) : (
							<div className="calAgendaEmpty">
								<span className="calAgendaEmptyTitle">
									{hasItems
										? calendarCopy.agendaEmpty
										: "Nothing this month yet"}
								</span>
								<span className="calAgendaEmptyBody">
									{hasItems
										? "Select another day or keep going. The calendar will gather more texture as your space grows."
										: "Try another mode, another folder, or let the month fill in as you write."}
								</span>
							</div>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}
