import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { todayIsoDateLocal } from "../../lib/tasks";
import { type TaskBucket, type TaskItem, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { Calendar, RefreshCw } from "../Icons";
import { Badge } from "../ui/shadcn/badge";
import { Button } from "../ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";

interface TasksPaneProps {
	onOpenFile: (relPath: string) => void;
}

const BUCKETS: Array<{ id: TaskBucket; label: string }> = [
	{ id: "inbox", label: "Inbox" },
	{ id: "today", label: "Today" },
	{ id: "upcoming", label: "Upcoming" },
];

export function TasksPane({ onOpenFile }: TasksPaneProps) {
	const [bucket, setBucket] = useState<TaskBucket>("inbox");
	const [tasks, setTasks] = useState<TaskItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
	const [scheduledDate, setScheduledDate] = useState("");
	const [dueDate, setDueDate] = useState("");
	const requestVersionRef = useRef(0);

	const loadTasks = useCallback(async () => {
		const requestVersion = requestVersionRef.current + 1;
		requestVersionRef.current = requestVersion;
		const isStale = () => requestVersionRef.current !== requestVersion;
		setLoading(true);
		setError("");
		try {
			const rows = await invoke("tasks_query", {
				bucket,
				today: todayIsoDateLocal(),
				limit: 2000,
			});
			if (isStale()) return;
			setTasks(rows);
		} catch (e) {
			if (isStale()) return;
			setError(e instanceof Error ? e.message : String(e));
			setTasks([]);
		} finally {
			if (isStale()) return;
			setLoading(false);
		}
	}, [bucket]);

	useEffect(() => {
		void loadTasks();
	}, [loadTasks]);

	useTauriEvent("notes:external_changed", () => {
		void loadTasks();
	});

	const grouped = useMemo(() => {
		const map = new Map<string, TaskItem[]>();
		for (const task of tasks) {
			const prev = map.get(task.note_path) ?? [];
			prev.push(task);
			map.set(task.note_path, prev);
		}
		return [...map.entries()];
	}, [tasks]);

	const toggleTask = useCallback(
		async (task: TaskItem, checked: boolean) => {
			try {
				setError("");
				await invoke("task_set_checked", { task_id: task.task_id, checked });
				await loadTasks();
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[loadTasks],
	);

	const applyDates = useCallback(async () => {
		if (!editingTaskId) return;
		try {
			setError("");
			await invoke("task_set_dates", {
				task_id: editingTaskId,
				scheduled_date: scheduledDate || null,
				due_date: dueDate || null,
			});
			setEditingTaskId(null);
			await loadTasks();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, [dueDate, editingTaskId, loadTasks, scheduledDate]);

	return (
		<section className="tasksPane">
			<header className="tasksPaneHeader">
				<div className="tasksBucketPills">
					{BUCKETS.map((item) => (
						<button
							key={item.id}
							type="button"
							className="tasksBucketPill"
							data-active={bucket === item.id}
							onClick={() => setBucket(item.id)}
						>
							{item.label}
						</button>
					))}
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={() => void loadTasks()}
				>
					<RefreshCw size={14} />
				</Button>
			</header>

			{error ? <div className="tasksPaneError">{error}</div> : null}
			{loading ? <div className="tasksPaneEmpty">Loading tasks…</div> : null}
			{!loading && tasks.length === 0 ? (
				<div className="tasksPaneEmpty">No tasks in this bucket.</div>
			) : null}

			<div className="tasksGroups">
				{grouped.map(([notePath, noteTasks]) => (
					<section key={notePath} className="tasksNoteGroup">
						<button
							type="button"
							className="tasksNoteHeader"
							onClick={() => onOpenFile(notePath)}
						>
							<span>{noteTasks[0]?.note_title || notePath}</span>
							<Badge variant="outline">{noteTasks.length}</Badge>
						</button>
						<div className="tasksList">
							{noteTasks.map((task) => (
								<div key={task.task_id} className="tasksRow">
									<input
										type="checkbox"
										checked={task.checked}
										onChange={(event) => {
											void toggleTask(task, event.target.checked);
										}}
									/>
									<div className="tasksRowContent">
										<div className="tasksRowText">{task.raw_text}</div>
										<div className="tasksRowMeta">
											{task.scheduled_date ? (
												<Badge variant="outline">
													⏳ {task.scheduled_date}
												</Badge>
											) : null}
											{task.due_date ? (
												<Badge variant="outline">📅 {task.due_date}</Badge>
											) : null}
											<Popover
												open={editingTaskId === task.task_id}
												onOpenChange={(open) => {
													if (!open) {
														setEditingTaskId(null);
														return;
													}
													setEditingTaskId(task.task_id);
													setScheduledDate(task.scheduled_date ?? "");
													setDueDate(task.due_date ?? "");
												}}
											>
												<PopoverTrigger asChild>
													<Button type="button" variant="ghost" size="xs">
														<Calendar size={12} />
														Schedule
													</Button>
												</PopoverTrigger>
												<PopoverContent
													className="tasksDatePopover"
													align="start"
													onInteractOutside={(event) => event.preventDefault()}
													onPointerDownOutside={(event) =>
														event.preventDefault()
													}
												>
													<label>
														Scheduled
														<input
															type="date"
															value={scheduledDate}
															onChange={(e) => setScheduledDate(e.target.value)}
														/>
													</label>
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
															onClick={() => setEditingTaskId(null)}
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
										</div>
									</div>
								</div>
							))}
						</div>
					</section>
				))}
			</div>
		</section>
	);
}
