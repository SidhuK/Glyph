import {
	AlertCircleIcon,
	CheckListIcon,
	Folder01Icon,
	NoteIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	useFileTreeContext,
	useSpace,
	useUILayoutContext,
} from "../../contexts";
import { navigationQueryKeys } from "../../lib/navigationPrefetch";
import { addTaskToDailyNote } from "../../lib/taskCapture";
import { stripTaskScheduleTokens, todayIsoDateLocal } from "../../lib/tasks";
import { type TaskItem, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { Hash, Search, Settings } from "../Icons";
import { Badge } from "../ui/shadcn/badge";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import { TaskCaptureComposer } from "./TaskCaptureComposer";
import { TaskRow } from "./TaskRow";

type TasksFilter = "today" | "overdue" | "inbox" | "by-note" | "by-tag" | "all";

interface TasksPaneProps {
	onOpenFile?: (relPath: string) => Promise<void>;
	onOpenDailyNotesSettings?: () => void;
}

interface TaskGroup {
	key: string;
	label: string;
	tasks: TaskItem[];
	icon: "task" | "alert" | "note" | "tag";
}

interface FolderTaskGroup {
	key: string;
	label: string;
	notes: TaskGroup[];
	taskCount: number;
}

interface TaskFilterOption {
	key: TasksFilter;
	label: string;
	count: number;
}

const TAG_PATTERN = /(?:^|\s)#([A-Za-z0-9][A-Za-z0-9_/-]*)/g;

function taskSortValue(task: TaskItem): string {
	return task.due_date ?? task.scheduled_date ?? "9999-12-31";
}

function sortTasks(tasks: TaskItem[]): TaskItem[] {
	return [...tasks].sort(
		(left, right) =>
			taskSortValue(left).localeCompare(taskSortValue(right)) ||
			left.note_title.localeCompare(right.note_title) ||
			left.line_start - right.line_start,
	);
}

function extractTaskTags(task: TaskItem): string[] {
	const tags = new Set<string>();
	for (const match of task.raw_text.matchAll(TAG_PATTERN)) {
		const tag = match[1]?.trim();
		if (tag) tags.add(tag);
	}
	return [...tags].sort((left, right) => left.localeCompare(right));
}

function taskMatchesSearch(task: TaskItem, query: string): boolean {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return true;
	const haystack = [
		stripTaskScheduleTokens(task.raw_text),
		task.note_title,
		task.note_path,
		task.section ?? "",
		extractTaskTags(task).join(" "),
	]
		.join(" ")
		.toLowerCase();
	return haystack.includes(normalized);
}

function noteLabel(task: TaskItem) {
	return task.note_title || task.note_path.split("/").pop() || task.note_path;
}

function groupByNote(tasks: TaskItem[]): TaskGroup[] {
	const groups = new Map<string, TaskItem[]>();
	for (const task of tasks) {
		groups.set(task.note_path, [...(groups.get(task.note_path) ?? []), task]);
	}
	return [...groups.entries()]
		.map(([notePath, groupTasks]) => ({
			key: notePath,
			label: noteLabel(groupTasks[0] as TaskItem),
			tasks: sortTasks(groupTasks),
			icon: "note" as const,
		}))
		.sort(
			(left, right) =>
				right.tasks.length - left.tasks.length ||
				left.label.localeCompare(right.label),
		);
}

function groupByTag(tasks: TaskItem[]): TaskGroup[] {
	const groups = new Map<string, TaskItem[]>();
	for (const task of tasks) {
		for (const tag of extractTaskTags(task)) {
			groups.set(tag, [...(groups.get(tag) ?? []), task]);
		}
	}
	return [...groups.entries()]
		.map(([tag, groupTasks]) => ({
			key: tag,
			label: `#${tag}`,
			tasks: sortTasks(groupTasks),
			icon: "tag" as const,
		}))
		.sort(
			(left, right) =>
				right.tasks.length - left.tasks.length ||
				left.label.localeCompare(right.label),
		);
}

function folderPathFor(notePath: string): string {
	const normalized = notePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
	const parts = normalized.split("/").filter(Boolean);
	parts.pop();
	return parts.join("/") || "Root";
}

function groupNotesByFolder(notes: TaskGroup[]): FolderTaskGroup[] {
	const folders = new Map<string, TaskGroup[]>();
	for (const note of notes) {
		const folder = folderPathFor(note.key);
		folders.set(folder, [...(folders.get(folder) ?? []), note]);
	}
	return [...folders.entries()]
		.map(([folder, folderNotes]) => ({
			key: folder,
			label: folder,
			notes: folderNotes.sort(
				(left, right) =>
					right.tasks.length - left.tasks.length ||
					left.label.localeCompare(right.label),
			),
			taskCount: folderNotes.reduce(
				(count, note) => count + note.tasks.length,
				0,
			),
		}))
		.sort((left, right) => {
			if (left.key === "Root") return -1;
			if (right.key === "Root") return 1;
			return left.label.localeCompare(right.label);
		});
}

function groupIcon(icon: TaskGroup["icon"]) {
	if (icon === "alert") {
		return (
			<HugeiconsIcon icon={AlertCircleIcon} size={13} strokeWidth={0.95} />
		);
	}
	if (icon === "note") {
		return <HugeiconsIcon icon={NoteIcon} size={13} strokeWidth={0.95} />;
	}
	if (icon === "tag") {
		return <Hash size={13} />;
	}
	return <HugeiconsIcon icon={CheckListIcon} size={13} strokeWidth={0.95} />;
}

function countLabel(count: number) {
	return `${count} ${count === 1 ? "task" : "tasks"}`;
}

function scheduledTaskCountLabel(count: number) {
	return `${count} scheduled ${count === 1 ? "task" : "tasks"}`;
}

function unscheduledTaskCountLabel(count: number) {
	return `${count} unscheduled ${count === 1 ? "task" : "tasks"}`;
}

function noteCountLabel(count: number) {
	return `${count} ${count === 1 ? "note" : "notes"}`;
}

export function TasksPane({
	onOpenFile,
	onOpenDailyNotesSettings,
}: TasksPaneProps) {
	const today = useMemo(() => todayIsoDateLocal(), []);
	const [activeFilter, setActiveFilter] = useState<TasksFilter>("today");
	const [query, setQuery] = useState("");
	const [error, setError] = useState("");
	const [taskDraft, setTaskDraft] = useState("");
	const taskInputRef = useRef<HTMLInputElement>(null);
	const queryClient = useQueryClient();
	const { spacePath } = useSpace();
	const {
		dailyNotesFolder,
		dailyNoteTemplatePath,
		setActiveMarkdownTabPath,
		setOpenMarkdownTabs,
	} = useUILayoutContext();
	const { setActiveFilePath } = useFileTreeContext();
	const tasksQuery = useQuery({
		queryKey: navigationQueryKeys.tasksList("all"),
		queryFn: () =>
			invoke("tasks_query_global", {
				filter: "all",
				today_date: today,
				limit: 2000,
			}),
	});

	const invalidateTasks = useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.tasks(),
		});
		await queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.calendar(),
		});
		await queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.taskSummaries(),
		});
		await queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.allDocs(),
		});
	}, [queryClient]);

	const focusTaskInput = useCallback(() => {
		window.requestAnimationFrame(() => taskInputRef.current?.focus());
	}, []);

	const appendTaskDraftToken = useCallback(
		(token: string) => {
			const trimmedToken = token.trim();
			if (!trimmedToken) return;
			setTaskDraft((draft) => {
				if (draft.includes(trimmedToken)) return draft;
				const trimmedDraft = draft.trimEnd();
				return trimmedDraft ? `${trimmedDraft} ${trimmedToken}` : trimmedToken;
			});
			focusTaskInput();
		},
		[focusTaskInput],
	);

	useTauriEvent("notes:external_changed", () => {
		void invalidateTasks();
	});

	const submitTaskMutation = useMutation({
		mutationFn: async () => {
			const normalized = taskDraft.replace(/\s+/g, " ").trim();
			if (!normalized) return;
			if (!dailyNotesFolder) {
				onOpenDailyNotesSettings?.();
				return;
			}
			setError("");
			const result = await addTaskToDailyNote({
				taskText: normalized,
				scheduledDate: today,
				dailyNotesFolder,
				dailyNoteTemplatePath,
				spacePath,
			});
			if (!result) return;
			setTaskDraft("");
			queryClient.setQueryData(navigationQueryKeys.note(result.path), {
				...result.previousDoc,
				text: result.text,
			});
		},
		onSuccess: async () => {
			await invalidateTasks();
		},
		onError: (cause) => {
			setError(cause instanceof Error ? cause.message : "Could not add task.");
		},
	});

	const submitTask = useCallback(async () => {
		await submitTaskMutation.mutateAsync();
	}, [submitTaskMutation]);

	const toggleTaskMutation = useMutation({
		mutationFn: ({ task, checked }: { task: TaskItem; checked: boolean }) =>
			invoke("task_set_checked", {
				task_id: task.task_id,
				checked,
			}),
		onMutate: () => setError(""),
		onSuccess: async () => {
			await invalidateTasks();
		},
		onError: (cause) => {
			setError(cause instanceof Error ? cause.message : String(cause));
		},
	});

	const scheduleTaskMutation = useMutation({
		mutationFn: ({
			task,
			scheduled,
			due,
		}: {
			task: TaskItem;
			scheduled: string | null;
			due: string | null;
		}) =>
			invoke("task_set_dates", {
				task_id: task.task_id,
				scheduled_date: scheduled,
				due_date: due,
			}),
		onMutate: () => setError(""),
		onSuccess: async () => {
			await invalidateTasks();
		},
		onError: (cause) => {
			setError(cause instanceof Error ? cause.message : String(cause));
		},
	});

	const toggleTask = useCallback(
		async (task: TaskItem, checked: boolean) => {
			try {
				await toggleTaskMutation.mutateAsync({ task, checked });
			} catch {
				// Mutation state owns the visible error.
			}
		},
		[toggleTaskMutation],
	);

	const scheduleTask = useCallback(
		async (
			task: TaskItem,
			scheduled: string | null,
			due: string | null,
		): Promise<boolean> => {
			try {
				await scheduleTaskMutation.mutateAsync({ task, scheduled, due });
				return true;
			} catch {
				return false;
			}
		},
		[scheduleTaskMutation],
	);

	const openTaskNote = useCallback(
		async (notePath: string) => {
			if (onOpenFile) {
				await onOpenFile(notePath);
				return;
			}
			setOpenMarkdownTabs((tabs) =>
				tabs.includes(notePath) ? tabs : [...tabs, notePath],
			);
			setActiveMarkdownTabPath(notePath);
			setActiveFilePath(notePath);
		},
		[
			onOpenFile,
			setActiveFilePath,
			setActiveMarkdownTabPath,
			setOpenMarkdownTabs,
		],
	);

	const activeTasks = useMemo(
		() => sortTasks(tasksQuery.data ?? []),
		[tasksQuery.data],
	);
	const todayTasks = useMemo(
		() =>
			activeTasks.filter(
				(task) => task.scheduled_date === today || task.due_date === today,
			),
		[activeTasks, today],
	);
	const overdueTasks = useMemo(
		() =>
			activeTasks.filter(
				(task) => task.due_date !== null && task.due_date < today,
			),
		[activeTasks, today],
	);
	const inboxTasks = useMemo(
		() =>
			activeTasks.filter((task) =>
				extractTaskTags(task)
					.map((tag) => tag.toLowerCase())
					.includes("inbox"),
			),
		[activeTasks],
	);
	const unscheduledTasks = useMemo(
		() => activeTasks.filter((task) => !task.due_date && !task.scheduled_date),
		[activeTasks],
	);
	const datedTasks = useMemo(
		() => activeTasks.filter((task) => task.due_date || task.scheduled_date),
		[activeTasks],
	);
	const taggedTaskCount = useMemo(
		() => activeTasks.filter((task) => extractTaskTags(task).length > 0).length,
		[activeTasks],
	);
	const unscheduledNoteGroups = useMemo(
		() => groupByNote(unscheduledTasks),
		[unscheduledTasks],
	);
	const filterOptions = useMemo<TaskFilterOption[]>(
		() => [
			{ key: "today", label: "Today", count: todayTasks.length },
			{ key: "overdue", label: "Overdue", count: overdueTasks.length },
			{ key: "inbox", label: "Inbox", count: inboxTasks.length },
			{
				key: "by-note",
				label: "By note",
				count: unscheduledNoteGroups.length,
			},
			{ key: "by-tag", label: "By tag", count: taggedTaskCount },
			{ key: "all", label: "All", count: activeTasks.length },
		],
		[
			activeTasks.length,
			inboxTasks.length,
			overdueTasks.length,
			taggedTaskCount,
			todayTasks.length,
			unscheduledNoteGroups.length,
		],
	);
	const visibleGroups = useMemo<TaskGroup[]>(() => {
		const searchTasks = (tasks: TaskItem[]) =>
			tasks.filter((task) => taskMatchesSearch(task, query));
		if (activeFilter === "overdue") {
			return [
				{
					key: "overdue",
					label: "Overdue",
					tasks: searchTasks(overdueTasks),
					icon: "alert",
				},
			];
		}
		if (activeFilter === "inbox") {
			return [
				{
					key: "inbox",
					label: "Inbox",
					tasks: searchTasks(inboxTasks),
					icon: "task",
				},
			];
		}
		if (activeFilter === "by-note") {
			return groupByNote(searchTasks(unscheduledTasks));
		}
		if (activeFilter === "by-tag") {
			return groupByTag(searchTasks(activeTasks));
		}
		if (activeFilter === "all") {
			return [
				{
					key: "all",
					label: "Scheduled tasks",
					tasks: searchTasks(datedTasks),
					icon: "task",
				},
			];
		}
		return [
			{
				key: "today",
				label: "Today",
				tasks: searchTasks(todayTasks),
				icon: "task",
			},
		];
	}, [
		activeFilter,
		activeTasks,
		datedTasks,
		inboxTasks,
		overdueTasks,
		query,
		todayTasks,
		unscheduledTasks,
	]);
	const visibleTaskCount = useMemo(
		() => visibleGroups.reduce((count, group) => count + group.tasks.length, 0),
		[visibleGroups],
	);
	const visibleUnscheduledNoteGroups = useMemo(
		() =>
			activeFilter === "all" || activeFilter === "by-note"
				? groupByNote(
						unscheduledTasks.filter((task) => taskMatchesSearch(task, query)),
					)
				: [],
		[activeFilter, query, unscheduledTasks],
	);
	const visibleUnscheduledTaskCount = useMemo(
		() =>
			visibleUnscheduledNoteGroups.reduce(
				(count, group) => count + group.tasks.length,
				0,
			),
		[visibleUnscheduledNoteGroups],
	);
	const visibleError =
		error ||
		(tasksQuery.error instanceof Error
			? tasksQuery.error.message
			: tasksQuery.error
				? String(tasksQuery.error)
				: "");
	const showingNoteList = activeFilter === "by-note";
	const showingMixedAll = activeFilter === "all";
	const visibleNoteFolderGroups = useMemo(
		() =>
			showingNoteList || showingMixedAll
				? groupNotesByFolder(visibleUnscheduledNoteGroups)
				: [],
		[showingMixedAll, showingNoteList, visibleUnscheduledNoteGroups],
	);
	const hasVisibleResults =
		visibleTaskCount > 0 ||
		((showingNoteList || showingMixedAll) &&
			visibleUnscheduledNoteGroups.length > 0);

	return (
		<div className="tasksPaneOuter">
			<section className="tasksPane">
				<div className="tasksDashboard">
					<header className="tasksDashboardHeader">
						<div className="tasksDashboardTitleBlock">
							<h2>Tasks</h2>
							<p>{countLabel(activeTasks.length)}</p>
						</div>
					</header>

					{dailyNotesFolder ? (
						<TaskCaptureComposer
							className="tasksTaskComposer"
							inputRef={taskInputRef}
							value={taskDraft}
							pending={submitTaskMutation.isPending}
							onValueChange={setTaskDraft}
							onSubmit={() => void submitTask()}
							chips={[
								{ label: "Today", active: true, onClick: focusTaskInput },
								{ label: "Scheduled today", onClick: focusTaskInput },
								{
									label: "Priority",
									onClick: () => appendTaskDraftToken("#priority"),
								},
								{
									label: "Inbox",
									onClick: () => appendTaskDraftToken("#inbox"),
								},
							]}
						/>
					) : (
						<div className="calendarInlineSetup tasksTaskComposerSetup">
							<span>Set a daily notes folder to add tasks.</span>
							<Button
								type="button"
								variant="ghost"
								size="xs"
								onClick={onOpenDailyNotesSettings}
							>
								<Settings size={13} />
								Settings
							</Button>
						</div>
					)}

					{visibleError ? (
						<div className="tasksPaneError">{visibleError}</div>
					) : null}

					<div className="tasksPaneToolbar">
						<div className="tasksPaneSearch">
							<Search size={14} />
							<Input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder={showingNoteList ? "Search notes" : "Search tasks"}
							/>
						</div>
						<div className="tasksPaneFilterBar" aria-label="Task filters">
							{filterOptions.map((option) => (
								<Button
									key={option.key}
									type="button"
									variant="ghost"
									size="sm"
									className="tasksPaneFilter"
									data-active={activeFilter === option.key ? "true" : undefined}
									onClick={() => setActiveFilter(option.key)}
								>
									<span>{option.label}</span>
									<Badge variant="outline" className="tasksPaneFilterCount">
										{option.count}
									</Badge>
								</Button>
							))}
						</div>
					</div>

					<section className="tasksPaneList" aria-label="Tasks">
						<div className="tasksPaneListHeader">
							<span>
								{showingNoteList
									? `${noteCountLabel(visibleUnscheduledNoteGroups.length)}, ${unscheduledTaskCountLabel(visibleUnscheduledTaskCount)}`
									: showingMixedAll
										? `${scheduledTaskCountLabel(visibleTaskCount)}, ${noteCountLabel(visibleUnscheduledNoteGroups.length)} with unscheduled tasks`
										: countLabel(visibleTaskCount)}
							</span>
							{tasksQuery.isFetching ? <span>Refreshing...</span> : null}
						</div>
						{!hasVisibleResults ? (
							<div className="tasksPaneEmpty">
								{showingNoteList
									? "No notes with unscheduled tasks."
									: "No matching tasks."}
							</div>
						) : null}
						{showingNoteList
							? visibleNoteFolderGroups.map((folder) => (
									<div key={folder.key} className="tasksPaneGroup">
										<div className="tasksPaneGroupHeader">
											<h3>
												<HugeiconsIcon
													icon={Folder01Icon}
													size={13}
													strokeWidth={0.95}
												/>
												<span>{folder.label}</span>
											</h3>
											<span>
												{noteCountLabel(folder.notes.length)},{" "}
												{unscheduledTaskCountLabel(folder.taskCount)}
											</span>
										</div>
										<div className="tasksPaneRows">
											{folder.notes.map((group) => (
												<button
													key={group.key}
													type="button"
													className="tasksRow"
													style={{
														width: "100%",
														font: "inherit",
														textAlign: "left",
													}}
													onClick={() => void openTaskNote(group.key)}
													title={group.key}
												>
													<HugeiconsIcon
														icon={NoteIcon}
														size={14}
														strokeWidth={0.95}
													/>
													<div className="tasksRowContent">
														<div className="tasksRowMain">
															<div className="tasksRowText">{group.label}</div>
															<span className="tasksPaneNoteTaskCount">
																{countLabel(group.tasks.length)}
															</span>
														</div>
													</div>
												</button>
											))}
										</div>
									</div>
								))
							: null}
						{!showingNoteList
							? visibleGroups.map((group) =>
									group.tasks.length > 0 ? (
										<div key={group.key} className="tasksPaneGroup">
											<div className="tasksPaneGroupHeader">
												<h3>
													{groupIcon(group.icon)}
													<span>{group.label}</span>
												</h3>
												<span>{countLabel(group.tasks.length)}</span>
											</div>
											<div className="tasksPaneRows">
												{group.tasks.map((task) => (
													<TaskRow
														key={task.task_id}
														task={task}
														today={today}
														showOpenNoteButton
														showSectionTag={false}
														onToggle={toggleTask}
														onSchedule={scheduleTask}
														onOpenNote={(notePath) =>
															void openTaskNote(notePath)
														}
													/>
												))}
											</div>
										</div>
									) : null,
								)
							: null}
						{showingMixedAll
							? visibleNoteFolderGroups.map((folder) => (
									<div
										key={`unscheduled-${folder.key}`}
										className="tasksPaneGroup"
									>
										<div className="tasksPaneGroupHeader">
											<h3>
												<HugeiconsIcon
													icon={Folder01Icon}
													size={13}
													strokeWidth={0.95}
												/>
												<span>{folder.label}</span>
											</h3>
											<span>
												{noteCountLabel(folder.notes.length)},{" "}
												{unscheduledTaskCountLabel(folder.taskCount)}
											</span>
										</div>
										<div className="tasksPaneRows">
											{folder.notes.map((group) => (
												<button
													key={group.key}
													type="button"
													className="tasksRow"
													style={{
														width: "100%",
														font: "inherit",
														textAlign: "left",
													}}
													onClick={() => void openTaskNote(group.key)}
													title={group.key}
												>
													<HugeiconsIcon
														icon={NoteIcon}
														size={14}
														strokeWidth={0.95}
													/>
													<div className="tasksRowContent">
														<div className="tasksRowMain">
															<div className="tasksRowText">{group.label}</div>
															<span className="tasksPaneNoteTaskCount">
																{countLabel(group.tasks.length)}
															</span>
														</div>
													</div>
												</button>
											))}
										</div>
									</div>
								))
							: null}
					</section>
				</div>
			</section>
		</div>
	);
}
