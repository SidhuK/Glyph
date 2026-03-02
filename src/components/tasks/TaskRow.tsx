import { useCallback, useState } from "react";
import {
	folderBreadcrumbFromNotePath,
	todayIsoDateLocal,
} from "../../lib/tasks";
import type { TaskItem } from "../../lib/tauri";
import { Calendar } from "../Icons";
import { Badge } from "../ui/shadcn/badge";
import { Button } from "../ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { TaskCheckbox } from "./TaskCheckbox";

interface TaskRowProps {
	task: TaskItem;
	withPath: boolean;
	onToggle: (task: TaskItem, checked: boolean) => void;
	onSchedule: (
		taskId: string,
		scheduled: string | null,
		due: string | null,
	) => Promise<void>;
	onOpenFile: (notePath: string) => void;
}

export function TaskRow({
	task,
	withPath,
	onToggle,
	onSchedule,
	onOpenFile,
}: TaskRowProps) {
	const [open, setOpen] = useState(false);
	const [scheduledDate, setScheduledDate] = useState(task.scheduled_date ?? "");
	const [dueDate, setDueDate] = useState(task.due_date ?? "");
	const folderBreadcrumb = folderBreadcrumbFromNotePath(task.note_path);

	const applyDates = useCallback(async () => {
		await onSchedule(task.task_id, scheduledDate || null, dueDate || null);
		setOpen(false);
	}, [dueDate, onSchedule, scheduledDate, task.task_id]);

	const setQuickDate = useCallback((offsetDays: number) => {
		const d = new Date();
		d.setDate(d.getDate() + offsetDays);
		const iso = todayIsoDateLocal(d);
		setScheduledDate(iso);
	}, []);

	return (
		<div className="tasksRow" data-checked={task.checked}>
			<TaskCheckbox
				checked={task.checked}
				onChange={(c) => onToggle(task, c)}
			/>
			<div className="tasksRowContent">
				<div className="tasksRowText">{task.raw_text}</div>
				<div className="tasksRowMeta">
					{task.section ? (
						<span className="tasksMetaTag">{task.section}</span>
					) : null}
					{task.scheduled_date ? (
						<Badge variant="outline" className="tasksMetaBadge">
							<Calendar size={11} />
							Scheduled {task.scheduled_date}
						</Badge>
					) : null}
					{task.due_date ? (
						<Badge variant="outline" className="tasksMetaBadge tasksMetaBadgeDue">
							<Calendar size={11} />
							Due {task.due_date}
						</Badge>
					) : null}
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
							>
								<Calendar size={12} />
								Schedule
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
									onClick={() => {
										setScheduledDate("");
										setDueDate("");
									}}
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
					{withPath ? (
						<button
							type="button"
							className="tasksRowPath"
							onClick={() => onOpenFile(task.note_path)}
							title={task.note_path}
						>
							{folderBreadcrumb}
						</button>
					) : null}
				</div>
			</div>
		</div>
	);
}
