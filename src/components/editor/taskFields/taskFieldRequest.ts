export type TaskFieldKind = "due" | "priority" | "status";

export interface TaskFieldRequest {
	kind: TaskFieldKind;
	query: string;
	pos: number;
}
