export const TASK_GROUP_BY = ["note", "status", "due", "priority", "tag", "none"] as const;
export const TASK_ORDER_BY = ["note", "due", "priority", "title"] as const;
export const TASK_LAYOUTS = ["list", "board"] as const;

export type TaskGroupBy = (typeof TASK_GROUP_BY)[number];
export type TaskOrderBy = (typeof TASK_ORDER_BY)[number];
type TaskLayout = (typeof TASK_LAYOUTS)[number];

export interface TaskDisplayState {
	groupBy: TaskGroupBy;
	orderBy: TaskOrderBy;
	showSubtasks: boolean;
	includeDone: boolean;
	layout: TaskLayout;
}

export const DEFAULT_TASK_DISPLAY: TaskDisplayState = {
	groupBy: "note",
	orderBy: "note",
	showSubtasks: false,
	includeDone: false,
	layout: "list",
};
