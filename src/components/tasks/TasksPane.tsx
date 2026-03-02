import * as Icons from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m } from "motion/react";
import {
	type ComponentProps,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	folderBreadcrumbFromNotePath,
	todayIsoDateLocal,
} from "../../lib/tasks";
import { type TaskBucket, type TaskItem, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { FileText, RefreshCw } from "../Icons";
import { springPresets } from "../ui/animations";
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
	description: string;
}> = [
	{
		id: "today",
		label: "Today",
		icon: Icons.SunriseIcon,
		description: "Work scheduled or due for today, laid out as a focused action list.",
	},
	{
		id: "upcoming",
		label: "Upcoming",
		icon: Icons.CalendarCheckOut02Icon,
		description: "Forward-looking tasks sorted by their next relevant date.",
	},
	{
		id: "inbox",
		label: "Inbox",
		icon: Icons.InboxIcon,
		description: "Unscheduled tasks grouped by note so triage stays close to source material.",
	},
];

export function TasksPane({ onOpenFile, onClosePane }: TasksPaneProps) {
	const [bucket, setBucket] = useState<TaskBucket>("inbox");
	const [tasks, setTasks] = useState<TaskItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
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
	const activeBucketMeta =
		BUCKETS.find((item) => item.id === bucket) ?? BUCKETS[0];
	const taskCountLabel = `${tasks.length} task${tasks.length === 1 ? "" : "s"}`;

	const openTaskFile = useCallback(
		async (notePath: string) => {
			await Promise.resolve(onOpenFile(notePath));
			if (onClosePane) {
				window.setTimeout(() => onClosePane(), 0);
			}
		},
		[onClosePane, onOpenFile],
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
			<header className="tasksPaneToolbar">
				<div className="tasksPaneToolbarPrimary">
					<div className="tasksPaneToolbarTitleRow">
						<h2 className="tasksPaneToolbarTitle">Tasks</h2>
						<span className="tasksPaneToolbarBadge">{taskCountLabel}</span>
					</div>
					<p className="tasksPaneToolbarSubtitle">
						{activeBucketMeta.description}
					</p>
				</div>
				<div className="tasksPaneToolbarActions">
					<span className="tasksPaneScopeChip" data-bucket={activeBucketMeta.id}>
						<HugeiconsIcon icon={activeBucketMeta.icon} size={14} />
						{activeBucketMeta.label}
					</span>
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
			<div className="tasksPaneBody">
				<div className="tasksPaneFilters">
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
										<m.span
											className="tasksBucketPillBg"
											layoutId="tasksBucketActive"
											transition={springPresets.snappy}
										/>
									)}
									<HugeiconsIcon
										icon={item.icon}
										size={16}
										className="tasksBucketPillIcon"
									/>
									<span className="tasksBucketPillLabel">{item.label}</span>
								</button>
							);
						})}
					</div>
				</div>

				{error ? <div className="tasksPaneError">{error}</div> : null}
				{loading ? <div className="tasksPaneLoading">Loading tasks…</div> : null}
				{!loading && tasks.length === 0 ? (
					<div className="tasksPaneEmptyState">
						<HugeiconsIcon
							icon={Icons.CheckListIcon}
							size={32}
							className="tasksPaneEmptyIcon"
						/>
						<div className="tasksPaneEmptyCopy">
							<strong>No tasks in {activeBucketMeta.label.toLowerCase()}.</strong>
							<span>Tasks from your notes will appear here as soon as they match this bucket.</span>
						</div>
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
										<span className="tasksNoteHeaderIcon" aria-hidden="true">
											<FileText size={14} />
										</span>
										<span className="tasksNoteHeaderMeta">
											<span className="tasksNoteHeaderTitle">
												{noteTasks[0]?.note_title || notePath}
											</span>
											<span className="tasksNoteHeaderPath">
												{folderBreadcrumbFromNotePath(notePath)}
											</span>
										</span>
									</span>
									<span className="tasksNoteHeaderCount">
										{noteTasks.length} item{noteTasks.length === 1 ? "" : "s"}
									</span>
								</button>
								<div className="tasksNoteGroupList">
									{noteTasks.map((task) => (
										<TaskRow
											key={task.task_id}
											task={task}
											withPath={false}
											onToggle={toggleTask}
											onSchedule={scheduleDates}
											onOpenFile={(p) => void openTaskFile(p)}
										/>
									))}
								</div>
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
			</div>
		</section>
	);
}
