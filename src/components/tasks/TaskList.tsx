import { File01Icon } from "@hugeicons/core-free-icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InboxTask } from "../../lib/tauri";
import { HugeiconsIcon } from "../HugeiconsIcon";
import { TaskRow } from "./TaskRow";

type TaskListEntry =
	| { kind: "task"; task: InboxTask }
	| { kind: "heading" }
	| { kind: "notes"; notes: { task: InboxTask; count: number }[] };

export function TaskList({
	tasks,
	groupUnscheduled,
	...rowProps
}: { tasks: InboxTask[]; groupUnscheduled: boolean } & Omit<
	Parameters<typeof TaskRow>[0],
	"task"
>) {
	const { t } = useTranslation("shell");
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
	const notes = new Map<string, { task: InboxTask; count: number }>();
	for (const task of tasks) {
		if (!groupUnscheduled || task.due) {
			entries.push({ kind: "task", task });
			continue;
		}
		const note = notes.get(task.note_path);
		if (note) note.count += 1;
		else notes.set(task.note_path, { task, count: 1 });
	}
	const grouped = [...notes.values()].sort((a, b) =>
		a.task.note_title.localeCompare(b.task.note_title),
	);
	if (grouped.length) entries.push({ kind: "heading" });
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
				? 110
				: entries[index]?.kind === "heading"
					? 48
					: 64,
		overscan: 8,
		getItemKey: (index) => {
			const entry = entries[index];
			return entry?.kind === "task"
				? `${entry.task.note_path}:${entry.task.start}`
				: entry?.kind === "notes"
					? `notes:${columns}:${entry.notes[0]?.task.note_path}`
					: "unscheduled-heading";
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
								<h2 className="taskNotesHeading">
									{t("tasks.notesWithUnscheduledTasks")}
								</h2>
							) : (
								<div
									className="taskNoteGrid"
									style={{
										gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
									}}
								>
									{entry.notes.map(({ task, count }) => (
										<button
											key={task.note_path}
											type="button"
											className="taskNoteCard"
											onClick={() => rowProps.onOpen(task)}
											title={task.note_path}
										>
											<HugeiconsIcon icon={File01Icon} size={30} />
											<span className="taskNoteCardText">
												<span className="taskNoteCardTitle">
													{task.note_title}
												</span>
												<span className="taskNoteCardCount">
													{t("tasks.unscheduledCount", { count })}
												</span>
											</span>
										</button>
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
