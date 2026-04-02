import {
	addDays,
	endOfMonth,
	endOfWeek,
	format,
	isSameMonth,
	parseISO,
	startOfMonth,
	startOfWeek,
} from "date-fns";

export const CALENDAR_TAB_ID = "__glyph_calendar__";

export interface CalendarRange {
	start: string;
	end: string;
	dates: string[];
}

export function parseCalendarDate(date: string): Date {
	return parseISO(`${date}T00:00:00`);
}

export function formatCalendarDate(date: Date): string {
	return format(date, "yyyy-MM-dd");
}

export function buildMonthRange(anchorDate: string): CalendarRange {
	const anchor = parseCalendarDate(anchorDate);
	const rangeStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 });
	const rangeEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 });
	return buildRange(rangeStart, rangeEnd);
}

export function buildRange(start: Date, end: Date): CalendarRange {
	const dates: string[] = [];
	for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
		dates.push(formatCalendarDate(cursor));
	}
	return {
		start: formatCalendarDate(start),
		end: formatCalendarDate(end),
		dates,
	};
}

export function shiftMonth(anchorDate: string, delta: number): string {
	const anchor = parseCalendarDate(anchorDate);
	const next = new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
	return formatCalendarDate(next);
}

export function isDateInMonth(date: string, monthAnchor: string): boolean {
	return isSameMonth(parseCalendarDate(date), parseCalendarDate(monthAnchor));
}

export function relativeDayLabel(date: string, today: string): string | null {
	if (date === today) return "Today";
	const tomorrow = formatCalendarDate(addDays(parseCalendarDate(today), 1));
	if (date === tomorrow) return "Tomorrow";
	const yesterday = formatCalendarDate(addDays(parseCalendarDate(today), -1));
	if (date === yesterday) return "Yesterday";
	return null;
}

export function formatDayTitle(date: string): string {
	return format(parseCalendarDate(date), "MMM d");
}

export function formatWeekday(date: string): string {
	return format(parseCalendarDate(date), "EEEE");
}

export function formatMonthDay(date: string): string {
	return formatDayTitle(date);
}

export function formatMonthName(date: Date): string {
	return format(date, "MMMM");
}

export function formatYear(date: Date): string {
	return format(date, "yyyy");
}

export function insertTaskIntoDailyNote(
	markdown: string,
	taskText: string,
	date: string,
): string {
	const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
	const normalizedTask = taskText.replace(/\s+/g, " ").trim();
	if (normalizedTask === "") {
		return markdown;
	}
	const taskLine = `- [ ] ${normalizedTask} ⏳ ${date}`;
	const lines = markdown.split(/\r?\n/);
	const tasksHeadingIndex = lines.findIndex(
		(line) => line.trim().toLowerCase() === "## tasks",
	);

	if (tasksHeadingIndex >= 0) {
		let insertIndex = tasksHeadingIndex + 1;
		while (insertIndex < lines.length) {
			const trimmed = lines[insertIndex]?.trim() ?? "";
			if (trimmed.startsWith("## ")) break;
			insertIndex += 1;
		}
		const next = [...lines];
		if (
			insertIndex > tasksHeadingIndex + 1 &&
			next[insertIndex - 1]?.trim() === ""
		) {
			insertIndex -= 1;
		}
		const shouldPadAbove = next[insertIndex - 1]?.trim() !== "";
		const shouldPadBelow = next[insertIndex]?.trim().startsWith("## ") ?? false;
		const inserts = [
			...(shouldPadAbove ? [""] : []),
			taskLine,
			...(shouldPadBelow ? [""] : []),
		];
		next.splice(insertIndex, 0, ...inserts);
		while (next[next.length - 1] === "") {
			next.pop();
		}
		return `${next.join(newline)}${newline}`;
	}

	const trimmed = markdown.trimEnd();
	if (!trimmed) {
		return `## Tasks${newline}${newline}${taskLine}${newline}`;
	}
	return `${trimmed}${newline}${newline}## Tasks${newline}${newline}${taskLine}${newline}`;
}
