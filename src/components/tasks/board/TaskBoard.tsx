import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import type { TaskRecord } from "@/lib/tauri";
import { boardDropStatusChar, createTaskBoardLanes, isTaskBoardLaneId } from "../model/taskBoard";
import type { TaskOrderBy } from "../model/taskDisplay";
import { taskKey } from "../model/taskIdentity";
import { useTasks } from "../TasksContext";
import { TaskBoardLane } from "./TaskBoardLane";

interface TaskBoardProps {
	records: readonly TaskRecord[];
	orderBy: TaskOrderBy;
	paneElement: HTMLElement | null;
}

export function TaskBoard({ records, orderBy, paneElement }: TaskBoardProps) {
	const { writeStatus } = useTasks();
	const lanes = createTaskBoardLanes(records, orderBy);

	const handleDragEnd = (event: DragEndEvent) => {
		if (event.canceled) return;
		const { source, target } = event.operation;
		const key = source?.data.taskKey;
		const laneId = target?.data.laneId;
		if (typeof key !== "string" || !isTaskBoardLaneId(laneId)) return;
		const lane = lanes.find((candidate) => candidate.id === laneId);
		const record = records.find((candidate) => taskKey(candidate) === key);
		if (!lane || !record) return;
		const statusChar = boardDropStatusChar(record, lane);
		if (statusChar !== null) writeStatus(record, statusChar);
	};

	return (
		<DragDropProvider onDragEnd={handleDragEnd}>
			<div className="tasksBoard" data-keeps-done="true">
				{lanes.map((lane) => (
					<TaskBoardLane key={lane.id} lane={lane} paneElement={paneElement} />
				))}
			</div>
		</DragDropProvider>
	);
}
