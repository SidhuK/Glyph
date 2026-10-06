import { DragDropProvider } from "@dnd-kit/react";
import { isSameDay, isSameMonth } from "date-fns";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { CalendarWindowState } from "../../../hooks/database/useCalendarWindow";
import { useDatabaseCalendar } from "../../../hooks/database/useDatabaseCalendar";
import {
	type CalendarEntry,
	calendarTitle,
	dateKey,
	shiftCalendarWindow,
	weekdayLabels,
} from "../../../lib/database/calendar";
import { databaseCellValueFromRow, databaseRowTitle } from "../../../lib/database/config";
import type { DatabaseCellValue, DatabaseColumn, DatabaseRow } from "../../../lib/database/types";
import { showNativeContextMenu } from "../../../lib/nativeContextMenu";
import type { DatabaseCreateRowInitialValue } from "../../../lib/tauri";
import { Button } from "../../ui/shadcn/button";
import {
	DatabaseCalendarCard,
	DatabaseCalendarDay,
	DatabaseCalendarHeader,
} from "./DatabaseCalendarParts";
import { DatabaseCalendarUnscheduled } from "./DatabaseCalendarUnscheduled";

interface DatabaseCalendarProps {
	databaseId: string;
	viewId: string;
	rows: DatabaseRow[];
	columns: DatabaseColumn[];
	dateColumnId: string | null;
	endDateColumnId: string | null;
	groupColumn: DatabaseColumn | null;
	calendar: CalendarWindowState;
	selectedRowPath: string | null;
	onSelectRow: (notePath: string) => void;
	onOpenRow: (notePath: string) => void;
	onCreateRow: (initialValues: DatabaseCreateRowInitialValue[]) => Promise<void>;
	onSaveCell: (notePath: string, column: DatabaseColumn, value: DatabaseCellValue) => Promise<void>;
	onOpenSettings: () => void;
}

function groupLabel(row: DatabaseRow, column: DatabaseColumn | null): string | null {
	if (!column) return null;
	const value = databaseCellValueFromRow(row, column);
	const label = value.value_list.length > 0 ? value.value_list.join(", ") : value.value_text;
	return label?.trim() || null;
}

export function DatabaseCalendar({
	databaseId,
	viewId,
	rows,
	columns,
	dateColumnId,
	endDateColumnId,
	groupColumn,
	calendar,
	selectedRowPath,
	onSelectRow,
	onOpenRow,
	onCreateRow,
	onSaveCell,
	onOpenSettings,
}: DatabaseCalendarProps) {
	const { t } = useTranslation("shell");
	const { dateColumn, entriesByDay, undated, reschedule, handleDragEnd, createOnDay } =
		useDatabaseCalendar({
			databaseId,
			viewId,
			rows,
			columns,
			dateColumnId,
			endDateColumnId,
			calendar,
			onCreateRow,
			onSaveCell,
		});
	const { calendarWindow, setCalendarWindow, weeks, locale } = calendar;
	const today = new Date();

	if (!dateColumn) {
		return (
			<div className="databaseBoardEmptyState">
				<div className="databaseBoardEmptyTitle">{t("collections.calendar.emptyTitle")}</div>
				<div className="databaseBoardEmptyText">{t("collections.calendar.emptyText")}</div>
				<div className="databaseBoardEmptyActions">
					<Button type="button" variant="ghost" size="sm" onClick={onOpenSettings}>
						{t("collections.openViewSettings")}
					</Button>
				</div>
			</div>
		);
	}

	const openContextMenu = (event: MouseEvent<HTMLButtonElement>, row: DatabaseRow) => {
		void showNativeContextMenu(event, [
			{ label: t("collections.card.openNote"), action: () => onOpenRow(row.note_path) },
			{ type: "separator" as const },
			{
				label: t("collections.calendar.moveToToday"),
				action: () => void reschedule(row, new Date()).catch(() => undefined),
			},
		]).catch((error: unknown) => {
			console.error("Failed to show calendar card context menu", error);
		});
	};

	const renderCard = (entry: CalendarEntry, key: string) => (
		<DatabaseCalendarCard
			key={`${entry.row.note_path}:${key}`}
			row={entry.row}
			dragId={`calendar-card:${entry.row.note_path}:${key}`}
			title={databaseRowTitle(entry.row)}
			groupLabel={groupLabel(entry.row, groupColumn)}
			continued={entry.continued}
			selected={entry.row.note_path === selectedRowPath}
			onSelectRow={onSelectRow}
			onOpenRow={onOpenRow}
			onContextMenu={(event) => openContextMenu(event, entry.row)}
		/>
	);

	const dayLabel = new Intl.DateTimeFormat(locale, { dateStyle: "full" });

	return (
		<DragDropProvider onDragEnd={handleDragEnd}>
			<div className="databaseCalendarShell" data-mode={calendarWindow.mode}>
				<div className="databaseCalendarMain">
					<DatabaseCalendarHeader
						title={calendarTitle(calendarWindow, weeks, locale)}
						mode={calendarWindow.mode}
						onModeChange={(mode) => setCalendarWindow((current) => ({ ...current, mode }))}
						onShift={(delta) => setCalendarWindow((current) => shiftCalendarWindow(current, delta))}
						onToday={() => setCalendarWindow((current) => ({ ...current, anchor: new Date() }))}
					/>
					<div className="databaseCalendarGrid" role="grid">
						<div className="databaseCalendarWeekdays" role="row">
							{weekdayLabels(weeks, locale).map((label) => (
								<div key={label} role="columnheader" className="databaseCalendarWeekday">
									{label}
								</div>
							))}
						</div>
						{weeks.map((week) => (
							<div key={dateKey(week[0] ?? today)} role="row" className="databaseCalendarWeek">
								{week.map((day) => {
									const key = dateKey(day);
									return (
										<DatabaseCalendarDay
											key={key}
											dateKey={key}
											dayNumber={day.getDate()}
											label={dayLabel.format(day)}
											isToday={isSameDay(day, today)}
											isOutside={
												calendarWindow.mode === "month" && !isSameMonth(day, calendarWindow.anchor)
											}
											onCreate={() => createOnDay(day)}
										>
											{(entriesByDay.get(key) ?? []).map((entry) => renderCard(entry, key))}
										</DatabaseCalendarDay>
									);
								})}
							</div>
						))}
					</div>
				</div>
				<DatabaseCalendarUnscheduled
					undated={undated}
					renderCard={(row) => renderCard({ row, continued: false }, "undated")}
				/>
			</div>
		</DragDropProvider>
	);
}
