import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { InboxTask } from "../../lib/tauri";
import { TaskRow } from "./TaskRow";

export function TaskList({
	tasks,
	...rowProps
}: { tasks: InboxTask[] } & Omit<Parameters<typeof TaskRow>[0], "task">) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer({
		count: tasks.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 64,
		overscan: 8,
		getItemKey: (index) => `${tasks[index]?.note_path}:${tasks[index]?.start}`,
	});
	return (
		<div ref={scrollRef} className="taskList">
			<ul
				className="taskListItems"
				style={{ height: virtualizer.getTotalSize(), position: "relative" }}
			>
				{virtualizer.getVirtualItems().map((item) => {
					const task = tasks[item.index];
					if (!task) return null;
					return (
						<li
							key={item.key}
							ref={virtualizer.measureElement}
							data-index={item.index}
							aria-posinset={item.index + 1}
							aria-setsize={tasks.length}
							className="taskVirtualRow"
							style={{ transform: `translateY(${item.start}px)` }}
						>
							<TaskRow {...rowProps} task={task} />
						</li>
					);
				})}
			</ul>
		</div>
	);
}
