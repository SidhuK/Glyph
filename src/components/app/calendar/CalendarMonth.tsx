import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowDown01Icon, ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { format, isSameDay, isSameMonth, isSameWeek, parseISO } from "date-fns";
import { type MouseEvent, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { activityTone } from "../../../lib/calendarActivity";
import type { SidebarCalendarLayout } from "../../../lib/settings/model";
import type { CalendarDayActivity } from "../../../lib/tauri";
import { CalendarDayCell } from "./CalendarDayCell";
import {
	buildVisibleWeeks,
	dateForNavigationKey,
	isDateInView,
	stepVisibleRange,
	weekStartsOnForLocale,
	weekdayLabels,
} from "./monthGrid";

/** Makes the month title a button; without one the title is plain text. */
export interface CalendarTitleAction {
	label: string;
	onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

interface CalendarMonthProps {
	/** Any date in the visible month, or in the visible week for the week layout. */
	month: Date;
	selected: Date;
	today: Date;
	activityByDate: Map<string, CalendarDayActivity>;
	locale: string;
	onMonthChange: (month: Date) => void;
	onSelect: (date: Date) => void;
	onGoToToday: () => void;
	layout: SidebarCalendarLayout;
	titleAction: CalendarTitleAction | null;
	onDayContextMenu: (event: MouseEvent<HTMLButtonElement>, date: Date) => void;
	/** Sidebar only: folds the calendar down to its month row. */
	collapse?: { collapsed: boolean; onToggle: () => void };
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
	layout,
	titleAction,
	onDayContextMenu,
	collapse,
}: CalendarMonthProps) {
	const { t } = useTranslation("shell");
	const [focusedKey, setFocusedKey] = useState<string | null>(null);
	const weekStartsOn = weekStartsOnForLocale(locale);
	const isWeek = layout === "week";
	const collapsed = collapse?.collapsed === true;
	const collapseLabel = collapsed ? t("sidebarCalendar.expand") : t("sidebarCalendar.collapse");

	const weeks = useMemo(
		() => buildVisibleWeeks(month, weekStartsOn, layout),
		[layout, month, weekStartsOn],
	);
	const weekdays = useMemo(() => weekdayLabels(locale, weekStartsOn), [locale, weekStartsOn]);

	const monthYearLabel = useMemo(
		() =>
			new Intl.DateTimeFormat(locale, {
				month: "long",
				year: "numeric",
			}).format(month),
		[locale, month],
	);
	const dayLabelFormat = useMemo(
		() => new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
		[locale],
	);
	// Locale order and separators (e.g. "2026年10月"), with only the year muted.
	const title = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" })
		.formatToParts(month)
		.map((part, index) =>
			part.type === "year" ? (
				<span key={index} className="calendarMonthTitleYear">
					{part.value}
				</span>
			) : (
				part.value
			),
		);

	const tabStopKey = useMemo(() => {
		const inView = (date: Date) => isDateInView(date, month, weekStartsOn, layout);
		if (focusedKey && inView(parseISO(focusedKey))) return focusedKey;
		if (inView(selected)) return format(selected, "yyyy-MM-dd");
		const firstInView = weeks.flat().find(inView) ?? weeks[0][0];
		return format(firstInView, "yyyy-MM-dd");
	}, [focusedKey, layout, month, selected, weekStartsOn, weeks]);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLTableElement>) => {
			const origin = event.target instanceof HTMLElement ? event.target.dataset.date : undefined;
			if (!origin) return;
			const from = parseISO(origin);
			const next = dateForNavigationKey(event.key, from, weekStartsOn);
			if (!next) return;
			event.preventDefault();
			setFocusedKey(format(next, "yyyy-MM-dd"));
			if (!isDateInView(next, month, weekStartsOn, layout)) onMonthChange(next);
		},
		[layout, month, onMonthChange, weekStartsOn],
	);

	const goToMonth = useCallback(
		(delta: number) => {
			setFocusedKey(null);
			onMonthChange(stepVisibleRange(month, delta, layout));
		},
		[layout, month, onMonthChange],
	);

	const handleSelect = useCallback(
		(date: Date) => {
			setFocusedKey(format(date, "yyyy-MM-dd"));
			if (!isDateInView(date, month, weekStartsOn, layout)) onMonthChange(date);
			onSelect(date);
		},
		[layout, month, onMonthChange, onSelect, weekStartsOn],
	);

	return (
		<div className="calendarMonth" data-collapsed={collapsed}>
			<header className="calendarMonthHeader">
				<h2 className="calendarMonthTitle">
					{titleAction ? (
						<button
							type="button"
							className="calendarMonthTitleButton"
							title={titleAction.label}
							onClick={titleAction.onClick}
						>
							{title}
						</button>
					) : (
						title
					)}
				</h2>
				<div className="calendarMonthControls">
					{collapsed ? null : (
						<>
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
								aria-label={isWeek ? t("calendar.previousWeek") : t("calendar.previousMonth")}
								onClick={() => goToMonth(-1)}
							>
								<HugeiconsIcon icon={ArrowLeft01Icon} size="var(--icon-sm)" />
							</button>
							<button
								type="button"
								className="calendarNavButton"
								aria-label={isWeek ? t("calendar.nextWeek") : t("calendar.nextMonth")}
								onClick={() => goToMonth(1)}
							>
								<HugeiconsIcon icon={ArrowRight01Icon} size="var(--icon-sm)" />
							</button>
						</>
					)}
					{collapse ? (
						<button
							type="button"
							className="calendarNavButton calendarCollapseButton"
							aria-expanded={!collapse.collapsed}
							aria-label={collapseLabel}
							title={collapseLabel}
							onClick={collapse.onToggle}
						>
							<HugeiconsIcon icon={ArrowDown01Icon} size="var(--icon-sm)" />
						</button>
					) : null}
				</div>
			</header>

			{collapsed ? null : (
				<table className="calendarGrid" aria-label={monthYearLabel} onKeyDown={handleKeyDown}>
					<thead>
						<tr>
							{weekdays.map((weekday) => (
								<th key={weekday.long} scope="col" className="calendarWeekday">
									<abbr title={weekday.long}>{weekday.narrow}</abbr>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{weeks.map((week) => (
							<tr
								key={format(week[0], "yyyy-MM-dd")}
								data-current-week={isSameWeek(week[0], today, { weekStartsOn })}
							>
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
											isOutside={!isWeek && !isSameMonth(date, month)}
											isTabStop={dateKey === tabStopKey}
											shouldFocus={dateKey === focusedKey}
											onSelect={handleSelect}
											onContextMenu={onDayContextMenu}
										/>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}
