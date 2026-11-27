import { TASK_STATUS_CHAR } from "@/lib/taskFields/taskStatus";
import type { TaskRecord, TaskStatusKind } from "@/lib/tauri";
import { orderTasks, visibleTasks } from "./allRows";
import type { TaskOrderBy } from "./taskDisplay";

type TaskBoardLaneId = Exclude<TaskStatusKind, "cancelled">;

export interface TaskBoardLane {
	id: TaskBoardLaneId;
	records: TaskRecord[];
}

const LANE_ORDER = ["todo", "in_progress", "done"] as const satisfies readonly TaskBoardLaneId[];

export function isTaskBoardLaneId(value: unknown): value is TaskBoardLaneId {
	return value === "todo" || value === "in_progress" || value === "done";
}

export function createTaskBoardLanes(
	records: readonly TaskRecord[],
	orderBy: TaskOrderBy,
): TaskBoardLane[] {
	const ordered = orderTasks(visibleTasks(records, false), orderBy);
	return LANE_ORDER.map((id) => ({
		id,
		records: ordered.filter((record) => record.status_kind === id),
	}));
}

export function boardDropStatusChar(record: TaskRecord, lane: TaskBoardLane): string | null {
	return record.status_kind === lane.id ? null : TASK_STATUS_CHAR[lane.id];
}
