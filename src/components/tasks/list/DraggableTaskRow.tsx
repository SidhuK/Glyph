import type { TaskItemRow } from "../model/taskRows";
import { TaskRow } from "../row/TaskRow";
import { useTasks } from "../TasksContext";
import { useTaskDraggable } from "./useTaskDraggable";

export const TASK_DRAG_TYPE = "tasks-row";

export function DraggableTaskRow({ row }: { row: TaskItemRow }) {
	const { expandedId } = useTasks();
	const { dragRef, isDragging } = useTaskDraggable({
		id: row.id,
		type: TASK_DRAG_TYPE,
		disabled: expandedId === row.id,
		data: { rowId: row.id },
	});
	return (
		<div ref={dragRef} className="tasksDraggable" data-dragging={isDragging ? "true" : undefined}>
			<TaskRow row={row} />
		</div>
	);
}
