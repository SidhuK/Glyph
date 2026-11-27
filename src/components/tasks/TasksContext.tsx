import { createContext, use } from "react";
import type { DateDisplayFormat } from "@/lib/dateDisplayFormat";
import type { TaskFieldEdits, TaskRecord } from "@/lib/tauri";
import type { HeldTasks } from "./data/heldTasks";
import type { UndoNotice } from "./data/useUndoNotice";
import type { QuickAddTarget } from "./data/useTaskCreate";

export interface QuickAddAnchor {
	anchor: string;
	due: string | null;
}

export interface TasksContextValue {
	today: string;
	locale: string;
	dateFormat: DateDisplayFormat;
	held: HeldTasks;
	undoNotice: UndoNotice | null;
	dismissUndo: () => void;
	expandedId: string | null;
	toggleExpanded: (id: string) => void;
	collapse: (options?: { restoreFocus: boolean }) => void;
	takeFocusReturn: (id: string) => boolean;
	toggleCircle: (record: TaskRecord) => void;
	writeStatus: (record: TaskRecord, statusChar: string) => void;
	setStatus: (record: TaskRecord, statusChar: string) => void;
	setFields: (record: TaskRecord, fields: TaskFieldEdits) => void;
	setTitle: (record: TaskRecord, title: string) => Promise<boolean>;
	reschedule: (records: readonly TaskRecord[], due: string) => void;
	openInNote: (record: TaskRecord) => void;
	quickAdd: QuickAddAnchor | null;
	openQuickAdd: (anchor: QuickAddAnchor) => void;
	closeQuickAdd: () => void;
	quickAddTarget: QuickAddTarget | null;
	dailyNotePath: string | null;
	setQuickAddTarget: (target: QuickAddTarget) => void;
}

export const TasksContext = createContext<TasksContextValue | null>(null);

export function useTasks(): TasksContextValue {
	const value = use(TasksContext);
	if (!value) throw new Error("useTasks must be used within TasksContext");
	return value;
}
