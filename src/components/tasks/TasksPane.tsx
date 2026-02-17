import * as Icons from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import {
	type ComponentProps,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { todayIsoDateLocal } from "../../lib/tasks";
import { type TaskBucket, type TaskItem, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { RefreshCw } from "../Icons";
import { springPresets } from "../ui/animations";
import { Badge } from "../ui/shadcn/badge";
import { Button } from "../ui/shadcn/button";
import { TaskRow } from "./TaskRow";

interface TasksPaneProps {
	onOpenFile: (relPath: string) => void | Promise<void>;
	onClosePane?: () => void;
}

const BUCKETS: Array<{
	id: TaskBucket;
	label: string;
	icon: ComponentProps<typeof HugeiconsIcon>["icon"];
}> = [
	{ id: "inbox", label: "Inbox", icon: Icons.InboxIcon },
	{ id: "today", label: "Today", icon: Icons.SunriseIcon },
	{ id: "upcoming", label: "Upcoming", icon: Icons.CalendarCheckOut02Icon },
];

export function TasksPane({ onOpenFile, onClosePane }: TasksPaneProps) {
	const [bucket, setBucket] = useState<TaskBucket>("inbox");
	const [tasks, setTasks] = useState<TaskItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [isPinned, setIsPinned] = useState(false);
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
			if (!isStale()) setLoading(false);
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
	const showGroupedInbox = bucket === "inbox";

	const openTaskFile = useCallback(
		async (notePath: string) => {
			await Promise.resolve(onOpenFile(notePath));
			if (!isPinned && onClosePane) {
				window.setTimeout(() => onClosePane(), 0);
			}
		},
		[isPinned, onClosePane, onOpenFile],
	);

	const toggleTask = useCallback(
		async (task: TaskItem, checked: boolean) => {
			try {
				setError("");
				await invoke("task_set_checked", {
					task_id: task.task_id,
					checked,
				});
				await loadTasks();
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[loadTasks],
	);

	const scheduleDates = useCallback(
		async (taskId: string, scheduled: string | null, due: string | null) => {
			try {
				setError("");
				await invoke("task_set_dates", {
					task_id: taskId,
					scheduled_date: scheduled,
					due_date: due,
				});
				await loadTasks();
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[loadTasks],
	);

	return (
		<section className="tasksPane">
			<header className="tasksPaneHeader">
				<div className="tasksPaneHeaderSpacer" />
				<div className="tasksBucketPills">
					{BUCKETS.map((item) => {
						const active = bucket === item.id;
						return (
							<button
								key={item.id}
								type="button"
								className="tasksBucketPill"
								data-bucket={item.id}
								data-active={active}
								onClick={() => setBucket(item.id)}
							>
								{active && (
									<motion.span
										className="tasksBucketPillBg"
										layoutId="tasksBucketActive"
										transition={springPresets.snappy}
									/>
								)}
								<HugeiconsIcon
									icon={item.icon}
									size={20}
									className="tasksBucketPillIcon"
								/>
								{item.label}
							</button>
						);
					})}
				</div>
				<div className="tasksPaneHeaderActions">
					<Button
						type="button"
						variant={isPinned ? "outline" : "ghost"}
						size="xs"
						onClick={() => setIsPinned((prev) => !prev)}
						title={isPinned ? "Unpin tasks pane" : "Pin tasks pane open"}
					>
						<span className="tasksPinGlyph" aria-hidden />
						{isPinned ? "Pinned" : "Pin"}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						onClick={() => void loadTasks()}
						title="Refresh tasks"
					>
						<RefreshCw size={14} />
					</Button>
				</div>
			</header>

			{error ? <div className="tasksPaneError">{error}</div> : null}
			{loading ? <div className="tasksPaneEmpty">Loading tasks…</div> : null}
			{!loading && tasks.length === 0 ? (
				<div className="tasksPaneEmptyState">
					<HugeiconsIcon
						icon={Icons.CheckListIcon}
						size={32}
						className="tasksPaneEmptyIcon"
					/>
					<span>No tasks in this bucket</span>
				</div>
			) : null}

			{showGroupedInbox ? (
				<div className="tasksGroups">
					{grouped.map(([notePath, noteTasks]) => (
						<section key={notePath} className="tasksNoteGroup">
							<button
								type="button"
								className="tasksNoteHeader"
								onClick={() => void openTaskFile(notePath)}
							>
								<span className="tasksNoteHeaderLead">
									<span className="tasksNoteHeaderTitle">
										{noteTasks[0]?.note_title || notePath}
									</span>
									<span className="tasksNoteHeaderPath">{notePath}</span>
								</span>
								<Badge variant="outline">{noteTasks.length}</Badge>
							</button>
						</section>
					))}
				</div>
			) : (
				<div className="tasksList tasksListFlat">
					{tasks.map((task) => (
						<TaskRow
							key={task.task_id}
							task={task}
							withPath={true}
							onToggle={toggleTask}
							onSchedule={scheduleDates}
							onOpenFile={(p) => void openTaskFile(p)}
						/>
					))}
				</div>
			)}
		</section>
	);
}
