import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { DatabaseFolderPicker } from "../database/DatabaseFolderPicker";
import {
	SettingsSegmented,
	SettingsToggle,
} from "../settings/SettingsScaffold";
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
			setItems([]);
			setNoteDateProperties([]);
			setLocalError(
				cause instanceof Error ? cause.message : "Failed to load calendar",
			);
		} finally {
			setLoading(false);
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
						<h2 className="calendarTitle">{formatMonthLabel(currentMonth)}</h2>

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
									<span className="calendarFilterToggleLabel">Subfolders</span>
									<SettingsToggle
										ariaLabel="Include subfolders"
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
						<div className="calendarEmptyState">Loading calendar…</div>
					) : mode === "notes" && noteDateProperties.length === 0 ? (
						<div className="calendarEmptyState">
							<div className="calendarEmptyTitle">No note date fields yet</div>
							<div className="calendarEmptyBody">
								Add a frontmatter property with a `YYYY-MM-DD` value or an ISO
								datetime to start placing notes on the calendar.
							</div>
						</div>
					) : mode === "daily_notes" && !canOpenDailyNotes ? (
						<div className="calendarEmptyState">
							<div className="calendarEmptyTitle">
								Daily notes are not configured
							</div>
							<div className="calendarEmptyBody">
								Set a daily notes folder in Settings before using this mode.
							</div>
						</div>
					) : (
						<CalendarMonthAdapter
							dates={monthDates}
							month={currentMonth}
							selectedDate={selectedDate}
							itemsByDate={itemsByDate}
							weekdayLabels={weekdayLabels}
							onSelectDate={setSelectedDate}
							onOpenItem={(item) => void openItem(item)}
						/>
					)}
				</div>

				{/* ── Day details / Agenda ────────────────────── */}
				<div className="calAgenda">
					<div className="calAgendaHeader">
						<span className="calAgendaDate">{selectedDateLabel}</span>
						<span className="calAgendaCount">
							{selectedDayItems.length}{" "}
							{selectedDayItems.length === 1 ? "item" : "items"}
						</span>
					</div>
					<div className="calAgendaScroller">
						{selectedDayItems.length > 0 ? (
							selectedDayItems.map((item) => (
								<button
									key={item.id}
									type="button"
									className="calAgendaCard databaseBoardCard"
									onClick={() => void openItem(item)}
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
								</button>
							))
						) : hasItems ? null : (
							<span className="calAgendaEmpty">Nothing this month.</span>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}
