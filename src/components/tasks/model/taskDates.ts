import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { type DateDisplayFormat, formatDisplayDate } from "@/lib/dateDisplayFormat";
import { toIsoDate } from "@/lib/taskFields/naturalDate";

type DueTone = "overdue" | "today" | "tomorrow" | "week" | "later";

const WEEK_DAYS = 7;
export function addIsoDays(isoDate: string, days: number): string {
	return toIsoDate(addDays(parseISO(isoDate), days));
}

export function daysFromToday(isoDate: string, today: string): number {
	return differenceInCalendarDays(parseISO(isoDate), parseISO(today));
}

export function dueTone(due: string, today: string): DueTone {
	const days = daysFromToday(due, today);
	if (days < 0) return "overdue";
	if (days === 0) return "today";
	if (days === 1) return "tomorrow";
	return days < WEEK_DAYS ? "week" : "later";
}

export function compactAbsoluteDate(
	isoDate: string,
	dateFormat: DateDisplayFormat,
	locale: string,
): string {
	if (dateFormat !== "friendly") return formatDisplayDate(isoDate, dateFormat);
	const date = parseISO(isoDate);
	const sameYear = date.getFullYear() === new Date().getFullYear();
	return date.toLocaleDateString(locale, {
		month: "short",
		day: "numeric",
		...(sameYear ? {} : { year: "numeric" }),
	});
}

export function weekdayName(isoDate: string, locale: string, width: "short" | "long"): string {
	return parseISO(isoDate).toLocaleDateString(locale, { weekday: width });
}

export function monthHeading(isoDate: string, locale: string): string {
	return parseISO(isoDate).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

export function fullDisplayDate(isoDate: string, dateFormat: DateDisplayFormat): string {
	return formatDisplayDate(isoDate, dateFormat, { weekday: true });
}
