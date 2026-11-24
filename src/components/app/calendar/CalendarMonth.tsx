import { Collapsible, CollapsibleContent } from "@/components/ui/shadcn/collapsible";
import { format, isSameDay, parseISO } from "date-fns";
import { type MouseEvent, type ReactNode, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SidebarCalendarLayout } from "../../../lib/settings/model";
import type { CalendarDayActivity } from "../../../lib/tauri";
import { CalendarMonthHeader } from "./CalendarMonthHeader";
import { CalendarWeekRow } from "./CalendarWeekRow";
import {
	buildVisibleWeeks,
	dateForNavigationKey,
	isDateInView,
	stepVisibleRange,
	weekStartsOnForLocale,
	weekdayLabels,
} from "./monthGrid";

export interface CalendarCollapse {
	collapsed: boolean;
	onCollapsedChange: (collapsed: boolean) => void;
}

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
	onOpenWeeklyNote: ((date: Date) => void) | null;
	drawer?: ReactNode;
	/** Sidebar only: folds the calendar down to its month row. */
	collapse?: CalendarCollapse;
	/** Shown below the grid, folding away with it. */
	children?: ReactNode;
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
	onOpenWeeklyNote,
	drawer,
	collapse,
	children,
}: CalendarMonthProps) {
	const { t } = useTranslation("shell");
	const [focusedKey, setFocusedKey] = useState<string | null>(null);
	const weekStartsOn = weekStartsOnForLocale(locale);
	const isWeek = layout === "week";
	const collapsed = collapse?.collapsed === true;

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
		<Collapsible
			className="calendarMonth"
			open={!collapsed}
			onOpenChange={(open) => collapse?.onCollapsedChange(!open)}
		>
			<CalendarMonthHeader
				month={month}
				locale={locale}
				visibleWeek={isWeek ? weeks[0] : null}
				showToday={!isSameDay(selected, today) || !isDateInView(today, month, weekStartsOn, layout)}
				titleAction={titleAction}
				collapsible={collapse !== undefined}
				collapsed={collapsed}
				onGoToToday={() => {
					setFocusedKey(null);
					onGoToToday();
				}}
				onStep={goToMonth}
			/>

			<CollapsibleContent className="calendarMonthBody">
				<table className="calendarGrid" aria-label={monthYearLabel} onKeyDown={handleKeyDown}>
					<colgroup>
						<col className="calendarWeekNumberColumn" />
					</colgroup>
					<thead>
						<tr>
							<th scope="col" className="calendarWeekday">
								<span className="sr-only">{t("calendar.week")}</span>
							</th>
							{weekdays.map((weekday) => (
								<th key={weekday.long} scope="col" className="calendarWeekday">
									<abbr title={weekday.long}>{weekday.narrow}</abbr>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{weeks.map((week) => (
							<CalendarWeekRow
								key={format(week[0], "yyyy-MM-dd")}
								week={week}
								month={isWeek ? null : month}
								selected={selected}
								today={today}
								activityByDate={activityByDate}
								dayLabelFormat={dayLabelFormat}
								tabStopKey={tabStopKey}
								focusedKey={focusedKey}
								drawer={drawer}
								onOpenWeeklyNote={onOpenWeeklyNote}
								onSelect={handleSelect}
								onDayContextMenu={onDayContextMenu}
							/>
						))}
					</tbody>
				</table>
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
