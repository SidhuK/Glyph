import {
	CalendarCheckOut02Icon,
	CheckListIcon,
	InboxIcon,
	SunriseIcon,
} from "@hugeicons/core-free-icons";
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
import { loadSettings } from "../../lib/settings";
import {
	compareIsoDates,
	folderBreadcrumbFromNotePath,
	getTaskTimeGroup,
	getTaskTimingSummary,
	todayIsoDateLocal,
} from "../../lib/tasks";
import { type TaskBucket, type TaskItem, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { ChevronDown, FileText } from "../Icons";
import { springPresets } from "../ui/animations";
import { Button } from "../ui/shadcn/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import { TaskRow } from "./TaskRow";

interface TasksPaneProps {
	onOpenFile: (relPath: string) => void | Promise<void>;
	onClosePane?: () => void;
}

type TaskSortMode = "smart" | "date" | "note" | "updated";
type TaskGroupMode = "smart" | "none" | "note" | "section";
type TaskFilterMode =
	| "all"
	| "overdue"
	| "due"
	| "scheduled"
	| "sectioned"
	| "recent";

interface TaskSection {
	key: string;
	label: string;
	order: number;
	tasks: TaskItem[];
	notePath?: string;
	helperText?: string;
}

const BUCKETS: Array<{
	id: TaskBucket;
	label: string;
	icon: ComponentProps<typeof HugeiconsIcon>["icon"];
}> = [
	{
		id: "today",
		label: "Today",
		icon: SunriseIcon,
	},
	{
		id: "upcoming",
		label: "Upcoming",
		icon: CalendarCheckOut02Icon,
	},
	{
		id: "inbox",
		label: "Inbox",
		icon: InboxIcon,
	},
];

const SORT_LABELS: Record<TaskSortMode, string> = {
	smart: "Smart",
	date: "Date",
	note: "Note",
	updated: "Updated",
};

const GROUP_LABELS: Record<TaskGroupMode, string> = {
	smart: "Smart",
	none: "None",
	note: "Note",
	section: "Section",
};

const FILTER_LABELS: Record<TaskFilterMode, string> = {
	all: "All tasks",
	overdue: "Overdue",
	due: "Due date",
	scheduled: "Scheduled date",
	sectioned: "With heading",
	recent: "Recently updated",
};

function getSortDate(
	task: TaskItem,
	today: string,
	bucket: TaskBucket,
): string | null {
	const candidates = [task.due_date, task.scheduled_date].filter(
		(value): value is string => Boolean(value),
	);

	if (bucket === "inbox") {
		return candidates.sort(compareIsoDates)[0] ?? null;
	}

	const matchingCandidates = candidates.filter((date) =>
		bucket === "today" ? date <= today : date > today,
	);
	return (
		matchingCandidates.sort(compareIsoDates)[0] ??
		candidates.sort(compareIsoDates)[0] ??
		null
	);
}

function sortTasks(
	rows: TaskItem[],
	sortMode: TaskSortMode,
	today: string,
	bucket: TaskBucket,
): TaskItem[] {
	return [...rows].sort((left, right) => {
		if (sortMode === "updated") {
			return (
				right.note_updated.localeCompare(left.note_updated) ||
				left.note_title.localeCompare(right.note_title) ||
				left.line_start - right.line_start
			);
		}

		if (sortMode === "note") {
			return (
				left.note_title.localeCompare(right.note_title) ||
				left.line_start - right.line_start
			);
		}

		const leftDate = getSortDate(left, today, bucket);
		const rightDate = getSortDate(right, today, bucket);
		const byDate = compareIsoDates(leftDate, rightDate);

		if (sortMode === "date") {
			return (
				byDate ||
				left.note_title.localeCompare(right.note_title) ||
				left.line_start - right.line_start
			);
		}

		const leftTiming = getTaskTimingSummary(left, today);
		const rightTiming = getTaskTimingSummary(right, today);

		return (
			Number(rightTiming.isOverdue) - Number(leftTiming.isOverdue) ||
			byDate ||
			left.priority - right.priority ||
			left.note_title.localeCompare(right.note_title) ||
			left.line_start - right.line_start
		);
	});
}

function buildTaskSections(
	rows: TaskItem[],
	groupMode: TaskGroupMode,
	bucket: TaskBucket,
	today: string,
): TaskSection[] {
	if (rows.length === 0) return [];

	const resolvedGroupMode =
		groupMode === "smart" ? (bucket === "inbox" ? "note" : "time") : groupMode;

	if (resolvedGroupMode === "none") {
		return [{ key: "all", label: "All tasks", order: 0, tasks: rows }];
	}

	const groups = new Map<string, TaskSection>();

	for (const task of rows) {
		if (resolvedGroupMode === "note") {
			const existing = groups.get(task.note_path);
			if (existing) {
				existing.tasks.push(task);
				continue;
			}
			groups.set(task.note_path, {
				key: task.note_path,
				label: task.note_title || task.note_path,
				order: groups.size,
				tasks: [task],
				notePath: task.note_path,
				helperText: folderBreadcrumbFromNotePath(task.note_path),
			});
			continue;
		}

		if (resolvedGroupMode === "section") {
			const sectionLabel = task.section ?? "No heading";
			const key = `section:${sectionLabel}`;
			const existing = groups.get(key);
			if (existing) {
				existing.tasks.push(task);
				continue;
			}
			groups.set(key, {
				key,
				label: sectionLabel,
				order: task.section ? 0 : 1,
				tasks: [task],
			});
			continue;
		}

		const timeGroup = getTaskTimeGroup(task, bucket, today);
		const key = `time:${timeGroup.key}`;
		const existing = groups.get(key);
		if (existing) {
			existing.tasks.push(task);
			continue;
		}
		groups.set(key, {
			key,
			label: timeGroup.label,
			order: timeGroup.order,
			tasks: [task],
		});
	}

	return [...groups.values()].sort((left, right) => {
		if (left.order !== right.order) {
			return left.order - right.order;
		}
		return left.label.localeCompare(right.label);
	});
}

function filterTasks(
	rows: TaskItem[],
	filterMode: TaskFilterMode,
	bucket: TaskBucket,
	today: string,
): TaskItem[] {
	if (filterMode === "all") return rows;
	if (filterMode === "due") {
		return rows.filter((task) => Boolean(task.due_date));
	}
	if (filterMode === "scheduled") {
		return rows.filter((task) => Boolean(task.scheduled_date));
	}
	if (filterMode === "overdue") {
		return rows.filter((task) => getTaskTimingSummary(task, today).isOverdue);
	}
	if (filterMode === "sectioned") {
		return rows.filter((task) => Boolean(task.section));
	}
	if (filterMode === "recent" && bucket === "inbox") {
		const recentCutoff = new Date();
		recentCutoff.setDate(recentCutoff.getDate() - 7);
		const cutoffIso = todayIsoDateLocal(recentCutoff);
		return rows.filter((task) => task.note_updated.slice(0, 10) >= cutoffIso);
	}
	return rows;
}

function getFilterOptions(bucket: TaskBucket): TaskFilterMode[] {
	if (bucket === "today") {
		return ["all", "overdue", "due", "scheduled"];
	}
	if (bucket === "upcoming") {
		return ["all", "due", "scheduled"];
	}
	return ["all", "sectioned", "recent"];
}

function getShowNoteContext(
	bucket: TaskBucket,
	groupMode: TaskGroupMode,
): boolean {
	if (groupMode === "note") return false;
	if (groupMode === "smart" && bucket === "inbox") return false;
	return true;
}

function getShowSectionTag(groupMode: TaskGroupMode): boolean {
	return groupMode !== "section";
}

export function TasksPane({ onOpenFile, onClosePane }: TasksPaneProps) {
	const [bucket, setBucket] = useState<TaskBucket>("inbox");
	const [tasks, setTasks] = useState<TaskItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [sortMode, setSortMode] = useState<TaskSortMode>("smart");
	const [groupMode, setGroupMode] = useState<TaskGroupMode>("smart");
	const [filterMode, setFilterMode] = useState<TaskFilterMode>("all");
	const requestVersionRef = useRef(0);
	const today = useMemo(() => todayIsoDateLocal(), []);

	const loadTasks = useCallback(async () => {
		const requestVersion = requestVersionRef.current + 1;
		requestVersionRef.current = requestVersion;
		const isStale = () => requestVersionRef.current !== requestVersion;
		setLoading(true);
		setError("");
		try {
			const settings = await loadSettings();
			const source = settings.tasks.source;
			const rows = await invoke("tasks_query", {
				bucket,
				today,
				limit: 2000,
				folders: source.mode === "folders" ? source.folders : null,
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
	}, [bucket, today]);

	useEffect(() => {
		void loadTasks();
	}, [loadTasks]);

	useEffect(() => {
		const validFilters = getFilterOptions(bucket);
		if (!validFilters.includes(filterMode)) {
			setFilterMode("all");
		}
	}, [bucket, filterMode]);

	useTauriEvent("notes:external_changed", () => {
		void loadTasks();
	});

	useTauriEvent("settings:updated", (payload) => {
		if (!payload.tasks?.source) return;
		void loadTasks();
	});

	const filteredTasks = useMemo(
		() => filterTasks(tasks, filterMode, bucket, today),
		[tasks, filterMode, bucket, today],
	);

	const sortedTasks = useMemo(
		() => sortTasks(filteredTasks, sortMode, today, bucket),
		[filteredTasks, sortMode, today, bucket],
	);

	const sections = useMemo(
		() => buildTaskSections(sortedTasks, groupMode, bucket, today),
		[sortedTasks, groupMode, bucket, today],
	);

	const overdueCount = useMemo(
		() =>
			filteredTasks.filter(
				(task) => getTaskTimingSummary(task, today).isOverdue,
			).length,
		[filteredTasks, today],
	);

	const activeBucketMeta =
		BUCKETS.find((item) => item.id === bucket) ?? BUCKETS[0];
	const filterOptions = getFilterOptions(bucket);
	const showNoteContext = getShowNoteContext(bucket, groupMode);
	const showSectionTag = getShowSectionTag(groupMode);

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
		async (
			taskId: string,
			scheduled: string | null,
			due: string | null,
		): Promise<boolean> => {
			try {
				setError("");
				await invoke("task_set_dates", {
					task_id: taskId,
					scheduled_date: scheduled,
					due_date: due,
				});
				await loadTasks();
				return true;
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
				return false;
			}
		},
		[loadTasks],
	);

	return (
		<section className="tasksPane">
			<div className="tasksPaneToolbar">
				<div className="tasksPaneToolbarPrimary">
					<div className="tasksPaneToolbarTitleRow">
						<h2 className="tasksPaneToolbarTitle">Tasks</h2>
						<span className="tasksPaneScopeChip" data-bucket={bucket}>
							{activeBucketMeta.label}
						</span>
						<span className="tasksPaneToolbarBadge">
							{filteredTasks.length}
							{filteredTasks.length === 1 ? " task" : " tasks"}
						</span>
						{filterMode !== "all" ? (
							<span className="tasksPaneToolbarBadge">
								Filter: {FILTER_LABELS[filterMode]}
							</span>
						) : null}
						{overdueCount > 0 ? (
							<span className="tasksPaneToolbarBadge" data-tone="danger">
								{overdueCount} overdue
							</span>
						) : null}
					</div>
				</div>
				<div className="tasksPaneToolbarActions">
					<MenuControl
						label="Sort"
						selectedValue={sortMode}
						value={SORT_LABELS[sortMode]}
						isActive={sortMode !== "smart"}
						options={(Object.keys(SORT_LABELS) as TaskSortMode[]).map(
							(value) => ({
								value,
								label: SORT_LABELS[value],
							}),
						)}
						onChange={(value) => setSortMode(value as TaskSortMode)}
					/>
					<MenuControl
						label="Group"
						selectedValue={groupMode}
						value={GROUP_LABELS[groupMode]}
						isActive={groupMode !== "smart"}
						options={(Object.keys(GROUP_LABELS) as TaskGroupMode[]).map(
							(value) => ({
								value,
								label: GROUP_LABELS[value],
							}),
						)}
						onChange={(value) => setGroupMode(value as TaskGroupMode)}
					/>
					<MenuControl
						label="Filter"
						selectedValue={filterMode}
						value={FILTER_LABELS[filterMode]}
						isActive={filterMode !== "all"}
						options={filterOptions.map((value) => ({
							value,
							label: FILTER_LABELS[value],
						}))}
						onChange={(value) => setFilterMode(value as TaskFilterMode)}
					/>
				</div>
			</div>

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
				{loading ? (
					<div className="tasksPaneLoading">Loading tasks…</div>
				) : null}
				{!loading &&
				!error &&
				filterMode === "all" &&
				filteredTasks.length === 0 ? (
					<div className="tasksPaneEmptyState">
						<HugeiconsIcon
							icon={CheckListIcon}
							size={32}
							className="tasksPaneEmptyIcon"
						/>
						<div className="tasksPaneEmptyCopy">
							<strong>
								No tasks in {activeBucketMeta.label.toLowerCase()}.
							</strong>
							<span>
								Tasks from your notes will appear here as soon as they match
								this view.
							</span>
						</div>
					</div>
				) : null}
				{!loading &&
				!error &&
				filterMode !== "all" &&
				filteredTasks.length === 0 ? (
					<div className="tasksPaneEmptyState">
						<HugeiconsIcon
							icon={CheckListIcon}
							size={32}
							className="tasksPaneEmptyIcon"
						/>
						<div className="tasksPaneEmptyCopy">
							<strong>No tasks match this filter.</strong>
							<span>
								Try switching the filter or clearing it to see the full bucket
								again.
							</span>
						</div>
					</div>
				) : null}

				{!loading && filteredTasks.length > 0 ? (
					<div className="tasksSections">
						{sections.map((section) => (
							<section key={section.key} className="tasksSection">
								{section.notePath ? (
									<button
										type="button"
										className="tasksNoteHeader"
										onClick={() => {
											if (section.notePath) {
												void openTaskFile(section.notePath);
											}
										}}
									>
										<span className="tasksNoteHeaderLead">
											<span className="tasksNoteHeaderIcon" aria-hidden="true">
												<FileText size={14} />
											</span>
											<span className="tasksNoteHeaderMeta">
												<span className="tasksNoteHeaderTitle">
													{section.label}
												</span>
												{section.helperText ? (
													<span className="tasksNoteHeaderPath">
														{section.helperText}
													</span>
												) : null}
											</span>
										</span>
										<span className="tasksNoteHeaderCount">
											{section.tasks.length} item
											{section.tasks.length === 1 ? "" : "s"}
										</span>
									</button>
								) : (
									<div className="tasksSectionHeader">
										<div className="tasksSectionHeaderLabel">
											{section.label}
										</div>
										<div className="tasksSectionHeaderCount">
											{section.tasks.length}
										</div>
									</div>
								)}
								<div className="tasksSectionList">
									{section.tasks.map((task) => (
										<TaskRow
											key={task.task_id}
											task={task}
											today={today}
											showNoteContext={showNoteContext}
											showSectionTag={showSectionTag}
											onToggle={toggleTask}
											onSchedule={scheduleDates}
											onOpenNote={openTaskFile}
										/>
									))}
								</div>
							</section>
						))}
					</div>
				) : null}
			</div>
		</section>
	);
}

function MenuControl({
	label,
	selectedValue,
	value,
	isActive,
	options,
	onChange,
}: {
	label: string;
	selectedValue: string;
	value: string;
	isActive: boolean;
	options: Array<{ value: string; label: string }>;
	onChange: (value: string) => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					size="xs"
					variant="ghost"
					className="tasksPaneMenuButton"
					data-active={isActive}
					data-open={open}
				>
					<span className="tasksPaneMenuKey">{label}</span>
					<span className="tasksPaneMenuDivider" aria-hidden="true" />
					<span className="tasksPaneMenuValue">{value}</span>
					<ChevronDown size={12} />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="tasksPaneMenuContent">
				<DropdownMenuLabel className="tasksPaneMenuHeader">
					{label}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuRadioGroup value={selectedValue} onValueChange={onChange}>
					{options.map((option) => (
						<DropdownMenuRadioItem
							key={option.value}
							value={option.value}
							className="tasksPaneMenuItem"
						>
							{option.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
