import {
	type Day,
	addDays,
	addMonths,
	addWeeks,
	endOfWeek,
	isSameMonth,
	isSameWeek,
	startOfMonth,
	startOfWeek,
} from "date-fns";
import type { SidebarCalendarLayout } from "../../../lib/settings/model";

const WEEKS_IN_GRID = 6;
const DAYS_IN_WEEK = 7;

export function weekStartsOnForLocale(locale: string): Day {
	return locale === "de" || locale === "es" || locale === "fr" || locale === "pl" ? 1 : 0;
}

/** Six fixed weeks so the grid height never shifts between months, or the anchor's single week. */
export function buildVisibleWeeks(
	anchor: Date,
	weekStartsOn: Day,
	layout: SidebarCalendarLayout,
): Date[][] {
	const firstCell = startOfWeek(layout === "week" ? anchor : startOfMonth(anchor), {
		weekStartsOn,
	});
	return Array.from({ length: layout === "week" ? 1 : WEEKS_IN_GRID }, (_, week) =>
		Array.from({ length: DAYS_IN_WEEK }, (_, day) => addDays(firstCell, week * DAYS_IN_WEEK + day)),
	);
}

/** Whether `date` is inside the visible range, so navigating to it needs no page change. */
export function isDateInView(
	date: Date,
	anchor: Date,
	weekStartsOn: Day,
	layout: SidebarCalendarLayout,
): boolean {
	return layout === "week" ? isSameWeek(date, anchor, { weekStartsOn }) : isSameMonth(date, anchor);
}

export function stepVisibleRange(anchor: Date, delta: number, layout: SidebarCalendarLayout): Date {
	return layout === "week" ? addWeeks(anchor, delta) : addMonths(anchor, delta);
}

export function weekdayLabels(
	locale: string,
	weekStartsOn: Day,
): Array<{ narrow: string; short: string; long: string }> {
	const narrowFormat = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
	const shortFormat = new Intl.DateTimeFormat(locale, { weekday: "short" });
	const longFormat = new Intl.DateTimeFormat(locale, { weekday: "long" });
	const firstDay = startOfWeek(new Date(), { weekStartsOn });
	return Array.from({ length: DAYS_IN_WEEK }, (_, index) => {
		const day = addDays(firstDay, index);
		return {
			narrow: narrowFormat.format(day),
			short: shortFormat.format(day),
			long: longFormat.format(day),
		};
	});
}

/** Grid keyboard model: arrows by day/week, Home/End by week, PageUp/Down by month. */
export function dateForNavigationKey(key: string, from: Date, weekStartsOn: Day): Date | null {
	switch (key) {
		case "ArrowLeft":
			return addDays(from, -1);
		case "ArrowRight":
			return addDays(from, 1);
		case "ArrowUp":
			return addDays(from, -DAYS_IN_WEEK);
		case "ArrowDown":
			return addDays(from, DAYS_IN_WEEK);
		case "Home":
			return startOfWeek(from, { weekStartsOn });
		case "End":
			return endOfWeek(from, { weekStartsOn });
		case "PageUp":
			return addMonths(from, -1);
		case "PageDown":
			return addMonths(from, 1);
		default:
			return null;
	}
}
