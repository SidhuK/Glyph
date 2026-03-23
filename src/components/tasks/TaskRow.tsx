import { ArrowLeft, ArrowRight } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { addMonths, format, parseISO } from "date-fns";
import { m, useReducedMotion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import {
	formatTaskCalendarDate,
	getTaskTimingSummary,
	stripTaskScheduleTokens,
	todayIsoDateLocal,
} from "../../lib/tasks";
import type { TaskItem } from "../../lib/tauri";
import { Calendar, Save, Trash2, X } from "../Icons";
import { springPresets } from "../ui/animations";
import { Badge } from "../ui/shadcn/badge";
import { Button } from "../ui/shadcn/button";
import { Calendar as DateCalendar } from "../ui/shadcn/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { TaskCheckbox } from "./TaskCheckbox";

interface TaskRowProps {
	task: TaskItem;
	today: string;
	showNoteContext?: boolean;
	showSectionTag?: boolean;
	onToggle: (task: TaskItem, checked: boolean) => void;
	onSchedule: (
		task: TaskItem,
		scheduled: string | null,
		due: string | null,
	) => Promise<boolean>;
	onOpenNote?: (notePath: string) => void | Promise<void>;
}

export function TaskRow({
	task,
	today,
	showNoteContext = false,
	showSectionTag = true,
	onToggle,
	onSchedule,
	onOpenNote,
}: TaskRowProps) {
	const [open, setOpen] = useState(false);
	const [activeDateField, setActiveDateField] = useState<"scheduled" | "due">(
		"scheduled",
	);
	const [scheduledDate, setScheduledDate] = useState(task.scheduled_date ?? "");
	const [dueDate, setDueDate] = useState(task.due_date ?? "");
	const [pickerMonth, setPickerMonth] = useState<Date>(new Date());
	const shouldReduceMotion = useReducedMotion();
	const displayText = useMemo(
		() => stripTaskScheduleTokens(task.raw_text),
		[task.raw_text],
	);
	const timing = useMemo(
		() => getTaskTimingSummary(task, today),
		[task, today],
	);

	const applyDates = useCallback(async () => {
		const applied = await onSchedule(
			task,
			scheduledDate || null,
			dueDate || null,
		);
		if (applied) {
			setOpen(false);
		}
	}, [dueDate, onSchedule, scheduledDate, task]);

	const applyQuickSchedule = useCallback(
		async (offsetDays: number) => {
			const d = new Date();
			d.setDate(d.getDate() + offsetDays);
			const iso = todayIsoDateLocal(d);
			const nextDueDate = dueDate || null;
			const applied = await onSchedule(task, iso, nextDueDate);
			if (applied) {
				setScheduledDate(iso);
				setDueDate(nextDueDate ?? "");
				setOpen(false);
			}
		},
		[dueDate, onSchedule, task],
	);

	const clearDates = useCallback(async () => {
		const cleared = await onSchedule(task, null, null);
		if (cleared) {
			setScheduledDate("");
			setDueDate("");
			setOpen(false);
		}
	}, [onSchedule, task]);

	const scheduleButtonLabel = useMemo(() => {
		const scheduledLabel = formatTaskCalendarDate(task.scheduled_date);
		if (scheduledLabel) return `Starts ${scheduledLabel}`;
		const dueLabel = formatTaskCalendarDate(task.due_date);
		if (dueLabel) return `Due ${dueLabel}`;
		return "Schedule";
	}, [task.due_date, task.scheduled_date]);

	const scheduleButtonTitle = useMemo(() => {
		if (task.scheduled_date && task.due_date) {
			return `Scheduled ${task.scheduled_date}, due ${task.due_date}`;
		}
		if (task.scheduled_date) {
			return `Scheduled ${task.scheduled_date}`;
		}
		if (task.due_date) {
			return `Due ${task.due_date}`;
		}
		return "Set a scheduled or due date";
	}, [task.due_date, task.scheduled_date]);

	const activeDateValue =
		activeDateField === "scheduled" ? scheduledDate : dueDate;

	const activeDate = useMemo(() => {
		if (!activeDateValue) return undefined;
		try {
			return parseISO(activeDateValue);
		} catch {
			return undefined;
		}
	}, [activeDateValue]);

	const formatPickerValue = useCallback((value: string) => {
		if (!value) return "Select date";
		try {
			return format(parseISO(value), "MMM d, yyyy");
		} catch {
			return value;
		}
	}, []);

	const updateActiveDate = useCallback(
		(date?: Date) => {
			const next = date ? todayIsoDateLocal(date) : "";
			if (activeDateField === "scheduled") {
				setScheduledDate(next);
				return;
			}
			setDueDate(next);
		},
		[activeDateField],
	);

	const focusField = useCallback(
		(field: "scheduled" | "due") => {
			setActiveDateField(field);
			const nextValue = field === "scheduled" ? scheduledDate : dueDate;
			if (!nextValue) {
				setPickerMonth(new Date());
				return;
			}
			try {
				setPickerMonth(parseISO(nextValue));
			} catch {
				setPickerMonth(new Date());
			}
		},
		[dueDate, scheduledDate],
	);

	return (
		<m.div
			className="tasksRow"
			data-checked={task.checked}
			data-overdue={timing.isOverdue}
			initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
			animate={{
				opacity: task.checked ? 0.78 : 1,
				y: 0,
				scale: task.checked ? 0.992 : 1,
			}}
			transition={
				shouldReduceMotion
					? { duration: 0 }
					: {
							...springPresets.snappy,
							opacity: { duration: 0.18, ease: "easeOut" },
						}
			}
		>
			<TaskCheckbox
				checked={task.checked}
				onChange={(c) => onToggle(task, c)}
			/>
			<div className="tasksRowContent">
				<div className="tasksRowMain">
					<div className="tasksRowText" title={displayText}>
						{displayText}
					</div>
					{showNoteContext ? (
						<button
							type="button"
							className="tasksMetaLink"
							title={task.note_path}
							onClick={() => void onOpenNote?.(task.note_path)}
						>
							{task.note_title || task.note_path}
						</button>
					) : null}
					{showSectionTag && task.section ? (
						<span className="tasksMetaTag tasksMetaTagInline">
							{task.section}
						</span>
					) : null}
					<div className="tasksRowMeta">
						{timing.badges.map((badge) => (
							<Badge
								key={`${task.task_id}-${badge.kind}-${badge.date}`}
								variant="outline"
								className={`tasksMetaBadge tasksMetaBadge-${badge.tone}`}
								title={`${badge.kind === "due" ? "Due" : "Scheduled"} ${badge.date}`}
							>
								<Calendar size={11} />
								{badge.label}
							</Badge>
						))}
					</div>
					<div className="tasksQuickActions">
						<Button
							type="button"
							variant="ghost"
							size="xs"
							className="tasksQuickActionBtn"
							onClick={() => void applyQuickSchedule(0)}
						>
							Today
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="xs"
							className="tasksQuickActionBtn"
							onClick={() => void applyQuickSchedule(1)}
						>
							Tomorrow
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="xs"
							className="tasksQuickActionBtn"
							onClick={() => void applyQuickSchedule(7)}
						>
							Next week
						</Button>
					</div>
					<Popover
						open={open}
						onOpenChange={(o) => {
							setOpen(o);
							if (o) {
								setScheduledDate(task.scheduled_date ?? "");
								setDueDate(task.due_date ?? "");
								const nextField = task.due_date ? "due" : "scheduled";
								setActiveDateField(nextField);
								const nextValue =
									nextField === "scheduled"
										? (task.scheduled_date ?? "")
										: (task.due_date ?? "");
								try {
									setPickerMonth(nextValue ? parseISO(nextValue) : new Date());
								} catch {
									setPickerMonth(new Date());
								}
							}
						}}
					>
						<PopoverTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="xs"
								className="tasksScheduleBtn"
								title={scheduleButtonTitle}
							>
								<Calendar size={12} />
								{scheduleButtonLabel}
							</Button>
						</PopoverTrigger>
						<PopoverContent
							className="tasksDatePopover"
							align="start"
							onInteractOutside={(e) => e.preventDefault()}
							onPointerDownOutside={(e) => e.preventDefault()}
						>
							<div className="tasksDatePickerFields">
								<button
									type="button"
									className="tasksDateFieldCard"
									data-active={activeDateField === "scheduled"}
									onClick={() => focusField("scheduled")}
								>
									<span className="tasksDateFieldLabel">Scheduled</span>
									<span
										className="tasksDateFieldValue"
										data-empty={!scheduledDate}
									>
										{formatPickerValue(scheduledDate)}
									</span>
								</button>
								<button
									type="button"
									className="tasksDateFieldCard"
									data-active={activeDateField === "due"}
									onClick={() => focusField("due")}
								>
									<span className="tasksDateFieldLabel">Due</span>
									<span className="tasksDateFieldValue" data-empty={!dueDate}>
										{formatPickerValue(dueDate)}
									</span>
								</button>
							</div>
							<div className="tasksDatePickerShell">
								<DateCalendar
									mode="single"
									selected={activeDate}
									onSelect={updateActiveDate}
									month={pickerMonth}
									onMonthChange={setPickerMonth}
									className="tasksDateCalendar"
								/>
							</div>
							<div className="tasksQuickDates">
								<Button
									type="button"
									variant="outline"
									size="xs"
									onClick={() => {
										const d = new Date();
										d.setDate(d.getDate() + 0);
										setScheduledDate(todayIsoDateLocal(d));
										setActiveDateField("scheduled");
									}}
								>
									Today
								</Button>
								<Button
									type="button"
									variant="outline"
									size="xs"
									onClick={() => {
										const d = new Date();
										d.setDate(d.getDate() + 1);
										setScheduledDate(todayIsoDateLocal(d));
										setActiveDateField("scheduled");
									}}
								>
									Tomorrow
								</Button>
								<Button
									type="button"
									variant="outline"
									size="xs"
									onClick={() => {
										const d = new Date();
										d.setDate(d.getDate() + 7);
										setScheduledDate(todayIsoDateLocal(d));
										setActiveDateField("scheduled");
									}}
								>
									Next week
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="xs"
									onClick={() => updateActiveDate(undefined)}
								>
									Clear selected
								</Button>
							</div>
							<div className="tasksDateActions">
								<Button
									type="button"
									variant="outline"
									size="icon-xs"
									title="Clear dates"
									aria-label="Clear dates"
									onClick={() => void clearDates()}
								>
									<Trash2 size={13} />
								</Button>
								<Button
									type="button"
									size="icon-xs"
									title="Apply dates"
									aria-label="Apply dates"
									onClick={() => void applyDates()}
								>
									<Save size={13} />
								</Button>
								<Button
									type="button"
									variant="outline"
									size="icon-xs"
									title="Previous month"
									aria-label="Previous month"
									onClick={() =>
										setPickerMonth((current) => addMonths(current, -1))
									}
								>
									<HugeiconsIcon icon={ArrowLeft} size={13} />
								</Button>
								<Button
									type="button"
									variant="outline"
									size="icon-xs"
									title="Next month"
									aria-label="Next month"
									onClick={() =>
										setPickerMonth((current) => addMonths(current, 1))
									}
								>
									<HugeiconsIcon icon={ArrowRight} size={13} />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									title="Close"
									aria-label="Close"
									onClick={() => setOpen(false)}
								>
									<X size={13} />
								</Button>
							</div>
						</PopoverContent>
					</Popover>
				</div>
			</div>
		</m.div>
	);
}
