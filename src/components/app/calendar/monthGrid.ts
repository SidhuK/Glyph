import {
	addDays,
	addMonths,
	endOfWeek,
	startOfMonth,
	startOfWeek,
} from "date-fns";

const WEEKS_IN_GRID = 6;
const DAYS_IN_WEEK = 7;

/** Six fixed weeks so the grid height never shifts between months. */
export function buildMonthWeeks(month: Date): Date[][] {
	const firstCell = startOfWeek(startOfMonth(month));
	return Array.from({ length: WEEKS_IN_GRID }, (_, week) =>
		Array.from({ length: DAYS_IN_WEEK }, (_, day) =>
			addDays(firstCell, week * DAYS_IN_WEEK + day),
		),
	);
}

export function weekdayLabels(
	locale: string,
): Array<{ short: string; long: string }> {
	const shortFormat = new Intl.DateTimeFormat(locale, { weekday: "short" });
	const longFormat = new Intl.DateTimeFormat(locale, { weekday: "long" });
	const firstDay = startOfWeek(new Date());
	return Array.from({ length: DAYS_IN_WEEK }, (_, index) => {
		const day = addDays(firstDay, index);
		return { short: shortFormat.format(day), long: longFormat.format(day) };
	});
}

/** Grid keyboard model: arrows by day/week, Home/End by week, PageUp/Down by month. */
export function dateForNavigationKey(key: string, from: Date): Date | null {
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
			return startOfWeek(from);
		case "End":
			return endOfWeek(from);
		case "PageUp":
			return addMonths(from, -1);
		case "PageDown":
			return addMonths(from, 1);
		default:
			return null;
	}
}
