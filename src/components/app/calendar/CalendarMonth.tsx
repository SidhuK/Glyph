import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	addMonths,
	format,
	isSameDay,
	isSameMonth,
	parseISO,
	startOfMonth,
} from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { activityTone } from "../../../lib/calendarActivity";
import type { CalendarDayActivity } from "../../../lib/tauri";
import { CalendarDayCell } from "./CalendarDayCell";
import {
	buildMonthWeeks,
	dateForNavigationKey,
	weekdayLabels,
} from "./monthGrid";

interface CalendarMonthProps {
	month: Date;
	selected: Date;
	today: Date;
	activityByDate: Map<string, CalendarDayActivity>;
	locale: string;
	onMonthChange: (month: Date) => void;
	onSelect: (date: Date) => void;
	onGoToToday: () => void;
}

export function CalendarMonth({
	month,
	selected,
	today,
	activityByDate,
	locale,
	onMonthChange,
	onSelect,
	onGoToToday,
}: CalendarMonthProps) {
	const { t } = useTranslation("shell");
	const [focusedKey, setFocusedKey] = useState<string | null>(null);

	const weeks = useMemo(() => buildMonthWeeks(month), [month]);
	const weekdays = useMemo(() => weekdayLabels(locale), [locale]);

	const monthLabel = useMemo(
		() => new Intl.DateTimeFormat(locale, { month: "long" }).format(month),
		[locale, month],
	);
	const dayLabelFormat = useMemo(
		() => new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
		[locale],
	);

	const tabStopKey = useMemo(() => {
		if (focusedKey) return focusedKey;
		if (isSameMonth(selected, month)) return format(selected, "yyyy-MM-dd");
		return format(startOfMonth(month), "yyyy-MM-dd");
	}, [focusedKey, month, selected]);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLTableElement>) => {
			const origin =
				event.target instanceof HTMLElement
					? event.target.dataset.date
					: undefined;
			if (!origin) return;
			const from = parseISO(origin);
			const next = dateForNavigationKey(event.key, from);
			if (!next) return;
			event.preventDefault();
			setFocusedKey(format(next, "yyyy-MM-dd"));
			if (!isSameMonth(next, month)) onMonthChange(next);
		},
		[month, onMonthChange],
	);

	const goToMonth = useCallback(
		(delta: number) => {
			setFocusedKey(null);
			onMonthChange(addMonths(month, delta));
		},
		[month, onMonthChange],
	);

	const handleSelect = useCallback(
		(date: Date) => {
			setFocusedKey(format(date, "yyyy-MM-dd"));
			if (!isSameMonth(date, month)) onMonthChange(date);
			onSelect(date);
		},
		[month, onMonthChange, onSelect],
	);

	return (
		<div className="calendarMonth">
			<header className="calendarMonthHeader">
				<h2 className="calendarMonthTitle">
					{monthLabel}
					<span className="calendarMonthYear">{month.getFullYear()}</span>
				</h2>
				<div className="calendarMonthControls">
					<button
						type="button"
						className="calendarTodayButton"
						onClick={() => {
							setFocusedKey(null);
							onGoToToday();
						}}
					>
						{t("calendar.today")}
					</button>
					<button
						type="button"
						className="calendarNavButton"
						aria-label={t("calendar.previousMonth")}
						onClick={() => goToMonth(-1)}
					>
						<HugeiconsIcon
							icon={ArrowLeft01Icon}
							size="var(--icon-lg)"
							strokeWidth={1.5}
						/>
					</button>
					<button
						type="button"
						className="calendarNavButton"
						aria-label={t("calendar.nextMonth")}
						onClick={() => goToMonth(1)}
					>
						<HugeiconsIcon
							icon={ArrowRight01Icon}
							size="var(--icon-lg)"
							strokeWidth={1.5}
						/>
					</button>
				</div>
			</header>

			<table
				className="calendarGrid"
				aria-label={`${monthLabel} ${month.getFullYear()}`}
				onKeyDown={handleKeyDown}
			>
				<thead>
					<tr>
						{weekdays.map((weekday) => (
							<th key={weekday.long} scope="col" className="calendarWeekday">
								<abbr title={weekday.long}>{weekday.short}</abbr>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{weeks.map((week) => (
						<tr key={format(week[0], "yyyy-MM-dd")}>
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
										isOutside={!isSameMonth(date, month)}
										isTabStop={dateKey === tabStopKey}
										shouldFocus={dateKey === focusedKey}
										onSelect={handleSelect}
									/>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
