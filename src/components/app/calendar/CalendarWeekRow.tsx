import { format, isSameDay, isSameMonth } from "date-fns";
import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { activityTone } from "../../../lib/calendarActivity";
import { isoWeekFromDate } from "../../../lib/periodNotes";
import type { CalendarDayActivity } from "../../../lib/tauri";
import type { CssVars } from "../../../lib/utils";
import { CalendarDayCell } from "./CalendarDayCell";
import { MIDWEEK_OFFSET } from "./monthGrid";

const GRID_COLUMNS = 8;

interface CalendarWeekRowProps {
	week: Date[];
	month: Date | null;
	selected: Date;
	today: Date;
	activityByDate: Map<string, CalendarDayActivity>;
	dayLabelFormat: Intl.DateTimeFormat;
	tabStopKey: string;
	focusedKey: string | null;
	drawer: ReactNode;
	onOpenWeeklyNote: ((date: Date) => void) | null;
	onSelect: (date: Date) => void;
	onDayContextMenu: (event: MouseEvent<HTMLButtonElement>, date: Date) => void;
}

export function CalendarWeekRow({
	week,
	month,
	selected,
	today,
	activityByDate,
	dayLabelFormat,
	tabStopKey,
	focusedKey,
	drawer,
	onOpenWeeklyNote,
	onSelect,
	onDayContextMenu,
}: CalendarWeekRowProps) {
	const { t } = useTranslation("shell");
	const midweek = week[MIDWEEK_OFFSET];
	const weekNumber = isoWeekFromDate(midweek).week;
	const selectedColumn = week.findIndex((date) => isSameDay(date, selected));
	const drawerStyle: CssVars<"--calendar-caret-column"> = {
		"--calendar-caret-column": selectedColumn,
	};

	return (
		<>
			<tr>
				<th scope="row" className="calendarWeekNumberCell">
					{onOpenWeeklyNote ? (
						<button
							type="button"
							className="calendarWeekNumber"
							title={t("calendar.openWeeklyNoteForWeek", { week: weekNumber })}
							aria-label={t("calendar.openWeeklyNoteForWeek", { week: weekNumber })}
							onClick={() => onOpenWeeklyNote(midweek)}
						>
							{weekNumber}
						</button>
					) : (
						<span className="calendarWeekNumber">{weekNumber}</span>
					)}
				</th>
				{week.map((date) => {
					const dateKey = format(date, "yyyy-MM-dd");
					return (
						<CalendarDayCell
							key={dateKey}
							date={date}
							dateKey={dateKey}
							label={dayLabelFormat.format(date)}
							tone={activityTone(activityByDate.get(dateKey))}
							isSelected={isSameDay(date, selected)}
							isToday={isSameDay(date, today)}
							isOutside={month !== null && !isSameMonth(date, month)}
							isTabStop={dateKey === tabStopKey}
							shouldFocus={dateKey === focusedKey}
							onSelect={onSelect}
							onContextMenu={onDayContextMenu}
						/>
					);
				})}
			</tr>
			{drawer && selectedColumn >= 0 ? (
				<tr className="calendarDrawerRow">
					<td colSpan={GRID_COLUMNS}>
						<div className="calendarDrawer" style={drawerStyle}>
							{drawer}
						</div>
					</td>
				</tr>
			) : null}
		</>
	);
}
