import { useVirtualizer } from "@tanstack/react-virtual";
import { useReducedMotion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDateDisplayFormat, useFileTreeContext } from "../../contexts";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import {
	formatDisplayDate,
	parseDisplayDateInput,
} from "../../lib/dateDisplayFormat";
import { normalizeInlineMarkdown } from "../../lib/markdownUtils";
import type { InboxTask } from "../../lib/tauri";
import { AllDocsCard } from "../app/AllDocsCard";
import { TaskProgressIndicator } from "../checklists/TaskProgressIndicator";
import { springPresets } from "../ui/animations";
import { TaskRow } from "./TaskRow";

type TaskListEntry =
	| { kind: "task"; task: InboxTask }
	| { kind: "heading"; label: string; id: string }
	| { kind: "notes"; notes: { task: InboxTask; tasks: InboxTask[] }[] };

export function TaskList({
	tasks,
	groupUnscheduled,
	onSelectNote,
	...rowProps
}: {
	tasks: InboxTask[];
	groupUnscheduled: boolean;
	onSelectNote: (path: string) => void;
} & Omit<Parameters<typeof TaskRow>[0], "task">) {
	const { t } = useTranslation("shell");
	const { itemAppearance } = useFileTreeContext();
	const shouldReduceMotion = useReducedMotion() ?? false;
	const dateFormat = useDateDisplayFormat();
	const scrollRef = useRef<HTMLDivElement>(null);
	const [columns, setColumns] = useState(1);
	const attachScroll = useCallback((element: HTMLDivElement | null) => {
		scrollRef.current = element;
		if (!element) return;
		const resize = () =>
			setColumns(
				Math.max(1, Math.min(3, Math.floor((element.clientWidth + 16) / 276))),
			);
		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	const entries: TaskListEntry[] = [];
	let lastDate: string | null = null;
	let hasUnscheduledHeading = false;
	const notes = new Map<string, { task: InboxTask; tasks: InboxTask[] }>();
	for (const task of tasks) {
		if (!groupUnscheduled || task.due) {
			if (!task.checked && task.due && task.due !== lastDate) {
				const date = parseDisplayDateInput(task.due);
				entries.push({
					kind: "heading",
					id: task.due,
					label:
						task.due === rowProps.today
							? t("tasks.views.today")
							: date
								? formatDisplayDate(date, dateFormat)
								: task.due,
				});
				lastDate = task.due;
			}
			if (!task.checked && !task.due && !hasUnscheduledHeading) {
				entries.push({
					kind: "heading",
					id: "unscheduled",
					label: t("tasks.unscheduled"),
				});
				hasUnscheduledHeading = true;
			}
			entries.push({ kind: "task", task });
			continue;
		}
		const note = notes.get(task.note_path);
		if (note) note.tasks.push(task);
		else notes.set(task.note_path, { task, tasks: [task] });
	}
	const summaries = useTaskSummariesForPaths(
		[...notes.keys()],
		groupUnscheduled,
	);
	const grouped = [...notes.values()].sort((a, b) =>
		a.task.note_title.localeCompare(b.task.note_title),
	);
	if (grouped.length)
		entries.push({
			kind: "heading",
			id: "notes",
			label: t("tasks.notesWithUnscheduledTasks"),
		});
	for (let index = 0; index < grouped.length; index += columns) {
		entries.push({
			kind: "notes",
			notes: grouped.slice(index, index + columns),
		});
	}
	const virtualizer = useVirtualizer({
		count: entries.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: (index) =>
			entries[index]?.kind === "notes"
				? 208
				: entries[index]?.kind === "heading"
					? 32
					: 46,
		overscan: 8,
		getItemKey: (index) => {
			const entry = entries[index];
			return entry?.kind === "task"
				? `${entry.task.note_path}:${entry.task.start}`
				: entry?.kind === "notes"
					? `notes:${columns}:${entry.notes[0]?.task.note_path}`
					: `heading:${entry?.kind === "heading" ? entry.id : index}`;
		},
	});
	return (
		<div ref={attachScroll} className="taskList">
			<ul
				className="taskListItems"
				style={{ height: virtualizer.getTotalSize(), position: "relative" }}
			>
				{virtualizer.getVirtualItems().map((item) => {
					const entry = entries[item.index];
					if (!entry) return null;
					return (
						<li
							key={item.key}
							ref={virtualizer.measureElement}
							data-index={item.index}
							className="taskVirtualRow"
							style={{ transform: `translateY(${item.start}px)` }}
						>
							{entry.kind === "task" ? (
								<TaskRow {...rowProps} task={entry.task} />
							) : entry.kind === "heading" ? (
								<h2 className="taskNotesHeading">{entry.label}</h2>
							) : (
								<div
									className="allDocsGrid"
									style={{
										gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
									}}
								>
									{entry.notes.map(({ task, tasks: noteTasks }) => (
										<AllDocsCard
											key={task.note_path}
											notePath={task.note_path}
											noteAppearance={itemAppearance[task.note_path]}
											title={task.note_title}
											preview={noteTasks.slice(0, 3).map((preview) => ({
												key: String(preview.start),
												kind: "task",
												text:
													normalizeInlineMarkdown(preview.text) ||
													t("tasks.untitled"),
											}))}
											taskSummary={summaries[task.note_path]}
											taskCount={summaries[task.note_path]?.total_count ?? 0}
											selected={false}
											animationIndex={item.index}
											shouldReduceMotion={shouldReduceMotion}
											springPreset={springPresets.snappy}
											TaskProgressComponent={TaskProgressIndicator}
											onSelect={() => onSelectNote(task.note_path)}
											onOpen={() => rowProps.onOpen(task)}
										/>
									))}
								</div>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}
