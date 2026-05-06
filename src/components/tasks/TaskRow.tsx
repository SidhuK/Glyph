import { m, useReducedMotion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import {
	formatTaskCalendarDate,
	getTaskTimingSummary,
	stripTaskScheduleTokens,
} from "../../lib/tasks";
import type { TaskItem } from "../../lib/tauri";
import { Calendar } from "../Icons";
import { springPresets } from "../ui/animations";
import { Badge } from "../ui/shadcn/badge";
import { Button } from "../ui/shadcn/button";
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
	const [scheduledDate, setScheduledDate] = useState(task.scheduled_date ?? "");
	const [dueDate, setDueDate] = useState(task.due_date ?? "");
	const shouldReduceMotion = useReducedMotion();
	const displayText = useMemo(
		() => stripTaskScheduleTokens(task.raw_text),
		[task.raw_text],
	);
	const timing = useMemo(
		() => getTaskTimingSummary(task, today),
		[task, today],
	);

	const resetDraftDates = useCallback(() => {
		setScheduledDate(task.scheduled_date ?? "");
		setDueDate(task.due_date ?? "");
	}, [task.due_date, task.scheduled_date]);

	const updateScheduledDate = useCallback(
		async (nextDate: string) => {
			setScheduledDate(nextDate);
			const applied = await onSchedule(task, nextDate || null, dueDate || null);
			if (!applied) resetDraftDates();
		},
		[dueDate, onSchedule, resetDraftDates, task],
	);

	const updateDueDate = useCallback(
		async (nextDate: string) => {
			setDueDate(nextDate);
			const applied = await onSchedule(
				task,
				scheduledDate || null,
				nextDate || null,
			);
			if (!applied) resetDraftDates();
		},
		[onSchedule, resetDraftDates, scheduledDate, task],
	);

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
					<Popover
						open={open}
						onOpenChange={(o) => {
							setOpen(o);
							if (o) {
								resetDraftDates();
								return;
							}
							resetDraftDates();
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
						<PopoverContent className="tasksDatePopover" align="start">
							<div className="tasksDateNativeFields">
								<label className="tasksDateNativeField">
									<span className="tasksDateFieldLabel">scheduled</span>
									<input
										type="date"
										value={scheduledDate}
										onChange={(event) =>
											void updateScheduledDate(event.currentTarget.value)
										}
									/>
								</label>
								<label className="tasksDateNativeField">
									<span className="tasksDateFieldLabel">due</span>
									<input
										type="date"
										value={dueDate}
										onChange={(event) =>
											void updateDueDate(event.currentTarget.value)
										}
									/>
								</label>
							</div>
						</PopoverContent>
					</Popover>
				</div>
			</div>
		</m.div>
	);
}
