import type { DragEndEvent } from "@dnd-kit/react";
import { useCallback, useMemo } from "react";
import {
	type CalendarEntry,
	calendarEntriesByDay,
	dateCellValue,
	parseCellDate,
	rescheduleUpdates,
} from "../../lib/database/calendar";
import type { DatabaseCellValue, DatabaseColumn, DatabaseRow } from "../../lib/database/types";
import type { DatabaseCreateRowInitialValue } from "../../lib/tauri";
import type { CalendarWindowState } from "./useCalendarWindow";
import { useDatabaseUndatedRows } from "./useDatabaseUndatedRows";

interface UseDatabaseCalendarOptions {
	databaseId: string;
	viewId: string;
	rows: DatabaseRow[];
	columns: DatabaseColumn[];
	dateColumnId: string | null;
	endDateColumnId: string | null;
	calendar: CalendarWindowState;
	onCreateRow: (initialValues: DatabaseCreateRowInitialValue[]) => Promise<void>;
	onSaveCell: (notePath: string, column: DatabaseColumn, value: DatabaseCellValue) => Promise<void>;
}

export function useDatabaseCalendar({
	databaseId,
	viewId,
	rows,
	columns,
	dateColumnId,
	endDateColumnId,
	calendar,
	onCreateRow,
	onSaveCell,
}: UseDatabaseCalendarOptions) {
	const dateColumn = columns.find((column) => column.id === dateColumnId) ?? null;
	const endDateColumn = columns.find((column) => column.id === endDateColumnId) ?? null;
	const undated = useDatabaseUndatedRows(databaseId, viewId, dateColumn !== null);

	const entriesByDay = useMemo(
		() =>
			dateColumn
				? calendarEntriesByDay(rows, calendar.weeks, dateColumn, endDateColumn)
				: new Map<string, CalendarEntry[]>(),
		[calendar.weeks, dateColumn, endDateColumn, rows],
	);

	const reschedule = useCallback(
		async (row: DatabaseRow, target: Date) => {
			if (!dateColumn) return;
			for (const update of rescheduleUpdates(row, target, dateColumn, endDateColumn)) {
				await onSaveCell(row.note_path, update.column, dateCellValue(update.date));
			}
		},
		[dateColumn, endDateColumn, onSaveCell],
	);

	const findRow = useCallback(
		(notePath: string) =>
			rows.find((row) => row.note_path === notePath) ??
			undated.rows.find((row) => row.note_path === notePath) ??
			null,
		[rows, undated.rows],
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			if (event.canceled) return;
			const { source, target } = event.operation;
			const notePath = source?.data.notePath;
			const targetKey = target?.data.dateKey;
			if (typeof notePath !== "string" || typeof targetKey !== "string") return;
			const row = findRow(notePath);
			const targetDate = parseCellDate(targetKey);
			if (!row || !targetDate) return;
			// onSaveCell surfaces failures in the pane error banner before rethrowing.
			reschedule(row, targetDate).catch(() => undefined);
		},
		[findRow, reschedule],
	);

	const createOnDay = useCallback(
		(day: Date) => {
			if (!dateColumn) return;
			void onCreateRow([{ column: dateColumn, value: dateCellValue(day) }]);
		},
		[dateColumn, onCreateRow],
	);

	return {
		dateColumn,
		entriesByDay,
		undated,
		reschedule,
		handleDragEnd,
		createOnDay,
	};
}
