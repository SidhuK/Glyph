import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { type Day, addMonths, isSameMonth } from "date-fns";
import { useTranslation } from "react-i18next";
import { toIsoDate } from "../../lib/taskFields/naturalDate";
import { weekdayLabels } from "../app/calendar/monthGrid";

interface TaskDatePickerCalendarProps {
	month: Date;
	weeks: Date[][];
	locale: string;
	weekStartsOn: Day;
	todayIso: string;
	selectedIso: string | null;
	focusedIso: string | null;
	dayId: (isoDate: string) => string;
	onMonthChange: (month: Date) => void;
	onSelect: (isoDate: string) => void;
	onHoverDay: (isoDate: string) => void;
}

export function TaskDatePickerCalendar({
	month,
	weeks,
	locale,
	weekStartsOn,
	todayIso,
	selectedIso,
	focusedIso,
	dayId,
	onMonthChange,
	onSelect,
	onHoverDay,
}: TaskDatePickerCalendarProps) {
	const { t } = useTranslation("editor");
	const monthTitle = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
		month,
	);
	const dayLabel = new Intl.DateTimeFormat(locale, { dateStyle: "full" });

	return (
		<div className="taskDatePickerCalendar">
			<header className="calendarMonthHeader">
				<h2 className="calendarMonthTitle">{monthTitle}</h2>
				<div className="calendarMonthNav">
					<button
						type="button"
						className="calendarNavButton"
						tabIndex={-1}
						aria-label={t("taskDatePicker.previousMonth")}
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => onMonthChange(addMonths(month, -1))}
					>
						<HugeiconsIcon icon={ArrowLeft01Icon} size="var(--icon-sm)" />
					</button>
					<button
						type="button"
						className="calendarNavButton"
						tabIndex={-1}
						aria-label={t("taskDatePicker.nextMonth")}
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => onMonthChange(addMonths(month, 1))}
					>
						<HugeiconsIcon icon={ArrowRight01Icon} size="var(--icon-sm)" />
					</button>
				</div>
			</header>
			<table className="calendarGrid" role="grid" aria-label={monthTitle}>
				<thead>
					<tr>
						{weekdayLabels(locale, weekStartsOn).map((weekday) => (
							<th key={weekday.long} scope="col" className="calendarWeekday">
								<abbr title={weekday.long}>{weekday.narrow}</abbr>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{weeks.map((week) => (
						<tr key={toIsoDate(week[0])}>
							{week.map((date) => {
								const isoDate = toIsoDate(date);
								return (
									<td
										key={isoDate}
										className="calendarDayCell"
										role="gridcell"
										aria-selected={isoDate === selectedIso}
									>
										<button
											type="button"
											id={dayId(isoDate)}
											className="calendarDay"
											tabIndex={-1}
											aria-label={dayLabel.format(date)}
											data-selected={isoDate === selectedIso}
											data-today={isoDate === todayIso}
											data-outside={!isSameMonth(date, month)}
											data-active={isoDate === focusedIso}
											onMouseDown={(event) => event.preventDefault()}
											onPointerMove={() => onHoverDay(isoDate)}
											onClick={() => onSelect(isoDate)}
										>
											{date.getDate()}
										</button>
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
