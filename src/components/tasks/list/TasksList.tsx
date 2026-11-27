import { useVirtualizer } from "@tanstack/react-virtual";
import { type Ref, useImperativeHandle, useState } from "react";
import type { TaskListRow } from "../model/taskRows";
import { TaskRowView, type TaskRowActions } from "./TaskRowView";

const ROW_ESTIMATES = {
	section: 36,
	task: 30,
	add: 30,
	footer: 32,
	empty: 168,
} as const satisfies Record<TaskListRow["kind"], number>;

const LIST_OVERSCAN = 10;

export interface TasksListHandle {
	scrollToRow: (index: number) => void;
}

interface TasksListProps {
	rows: readonly TaskListRow[];
	paneElement: HTMLElement | null;
	actions: TaskRowActions;
	keepsDone?: boolean;
	stickyOffset?: number;
	ref?: Ref<TasksListHandle>;
}

export function TasksList({
	rows,
	paneElement,
	actions,
	keepsDone = false,
	stickyOffset = 0,
	ref,
}: TasksListProps) {
	const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
	const virtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
		count: rows.length,
		estimateSize: (index) => ROW_ESTIMATES[rows[index]?.kind ?? "task"],
		getItemKey: (index) => rows[index]?.id ?? index,
		getScrollElement: () => paneElement,
		scrollMargin: listElement?.offsetTop ?? 0,
		scrollPaddingStart: stickyOffset,
		overscan: LIST_OVERSCAN,
	});

	useImperativeHandle(
		ref,
		() => ({
			scrollToRow: (index) => virtualizer.scrollToIndex(index, { align: "start" }),
		}),
		[virtualizer],
	);

	return (
		<div
			ref={setListElement}
			className="tasksList"
			data-keeps-done={keepsDone ? "true" : undefined}
			style={{ height: `${virtualizer.getTotalSize()}px` }}
		>
			{virtualizer.getVirtualItems().map((virtualRow) => {
				const row = rows[virtualRow.index];
				if (!row) return null;
				return (
					<div
						key={row.id}
						data-index={virtualRow.index}
						ref={virtualizer.measureElement}
						className="tasksVirtualRow"
						style={{
							transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
						}}
					>
						<TaskRowView row={row} actions={actions} />
					</div>
				);
			})}
		</div>
	);
}
