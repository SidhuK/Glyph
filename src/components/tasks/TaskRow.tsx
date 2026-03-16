import { m, useReducedMotion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import {
	formatTaskCalendarDate,
	getTaskTimingSummary,
	stripTaskScheduleTokens,
	todayIsoDateLocal,
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

	const setQuickDate = useCallback((offsetDays: number) => {
		const d = new Date();
		d.setDate(d.getDate() + offsetDays);
		const iso = todayIsoDateLocal(d);
		setScheduledDate(iso);
	}, []);

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
							<label>
								Scheduled
								<input
									type="date"
									value={scheduledDate}
									onChange={(e) => setScheduledDate(e.target.value)}
								/>
							</label>
							<div className="tasksQuickDates">
								<Button
									type="button"
									variant="outline"
									size="xs"
									onClick={() => setQuickDate(0)}
								>
									Today
								</Button>
								<Button
									type="button"
									variant="outline"
									size="xs"
									onClick={() => setQuickDate(1)}
								>
									Tomorrow
								</Button>
								<Button
									type="button"
									variant="outline"
									size="xs"
									onClick={() => setQuickDate(7)}
								>
									Next week
								</Button>
							</div>
							<label>
								Due
								<input
									type="date"
									value={dueDate}
									onChange={(e) => setDueDate(e.target.value)}
								/>
							</label>
							<div className="tasksDateActions">
								<Button
									type="button"
									variant="ghost"
									size="xs"
									onClick={() => setOpen(false)}
								>
									Close
								</Button>
								<Button
									type="button"
									variant="outline"
									size="xs"
									onClick={() => void clearDates()}
								>
									Clear
								</Button>
								<Button
									type="button"
									size="xs"
									onClick={() => void applyDates()}
								>
									Apply
								</Button>
							</div>
						</PopoverContent>
					</Popover>
				</div>
			</div>
		</m.div>
	);
}
