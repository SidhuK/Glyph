import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDateDisplayFormat } from "@/contexts";
import { getTodayDateString } from "@/lib/dailyNotes";
import { circleToggleChar, isOpenStatus, taskStatusKindOf } from "@/lib/taskFields/taskStatus";
import { requestTaskLineJump } from "@/lib/taskLineJump";
import type { TaskRecord } from "@/lib/tauri";
import { type QuickAddTarget, useDailyNotePath } from "./data/useTaskCreate";
import { useTaskCompletion } from "./data/useTaskCompletion";
import { useTaskWrites } from "./data/useTaskWrites";
import type { QuickAddAnchor, TasksContextValue } from "./TasksContext";

export function useTasksController(onOpenFile: (relPath: string) => Promise<void>) {
	const { i18n } = useTranslation("shell");
	const dateFormat = useDateDisplayFormat();
	const today = getTodayDateString();
	const { writeTasks } = useTaskWrites(today);
	const completion = useTaskCompletion({ today, writeTasks });
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const focusReturnIdRef = useRef<string | null>(null);
	const [quickAdd, setQuickAdd] = useState<QuickAddAnchor | null>(null);
	const [chosenTarget, setChosenTarget] = useState<QuickAddTarget | null>(null);
	const dailyNotePath = useDailyNotePath(today);
	const quickAddTarget: QuickAddTarget | null =
		chosenTarget ?? (dailyNotePath === null ? null : { kind: "daily" });

	const setStatus = (record: TaskRecord, statusChar: string) => {
		const nextKind = taskStatusKindOf(statusChar);
		if (nextKind === record.status_kind) return;
		if (isOpenStatus(record.status_kind) && nextKind === "done") {
			void completion.changeWithHold(record, statusChar);
			return;
		}
		void writeTasks([{ record, change: { status: statusChar } }]);
	};

	const value: TasksContextValue = {
		today,
		locale: i18n.language,
		dateFormat,
		held: completion.held,
		undoNotice: completion.undoNotice,
		dismissUndo: completion.dismissUndo,
		expandedId,
		toggleExpanded: (id) => setExpandedId((current) => (current === id ? null : id)),
		collapse: (options) => {
			focusReturnIdRef.current = options?.restoreFocus ? expandedId : null;
			setExpandedId(null);
		},
		takeFocusReturn: (id) => {
			if (focusReturnIdRef.current !== id) return false;
			focusReturnIdRef.current = null;
			return true;
		},
		toggleCircle: (record) => void completion.changeWithHold(record, circleToggleChar(record)),
		writeStatus: (record, statusChar) => {
			if (taskStatusKindOf(statusChar) !== record.status_kind)
				void writeTasks([{ record, change: { status: statusChar } }]);
		},
		setStatus,
		setFields: (record, fields) => void writeTasks([{ record, change: { fields } }]),
		setTitle: (record, title) => writeTasks([{ record, change: { title } }]),
		reschedule: (records, due) =>
			void writeTasks(records.map((record) => ({ record, change: { fields: { due } } }))),
		openInNote: (record) => {
			requestTaskLineJump({ path: record.note_path, byteOffset: record.start });
			void onOpenFile(record.note_path);
		},
		quickAdd,
		openQuickAdd: (anchor) => {
			setExpandedId(null);
			setQuickAdd(anchor);
		},
		closeQuickAdd: () => setQuickAdd(null),
		quickAddTarget,
		dailyNotePath,
		setQuickAddTarget: setChosenTarget,
	};

	return { value, clearTimers: completion.clearAllTimers, flushHolds: completion.flushHolds };
}
