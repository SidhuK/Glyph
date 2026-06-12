import { addDays, endOfWeek, format, parseISO, startOfWeek } from "date-fns";

export const CALENDAR_TAB_ID = "__glyph_calendar__";

export interface CalendarRange {
	start: string;
	end: string;
	dates: string[];
}

export function parseCalendarDate(date: string): Date {
	return parseISO(`${date}T00:00:00`);
}

function formatCalendarDate(date: Date): string {
	return format(date, "yyyy-MM-dd");
}

export function buildWeekRange(anchorDate: string): CalendarRange {
	const anchor = parseCalendarDate(anchorDate);
	return buildRange(
		startOfWeek(anchor, { weekStartsOn: 0 }),
		endOfWeek(anchor, { weekStartsOn: 0 }),
	);
}

function buildRange(start: Date, end: Date): CalendarRange {
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

export function shiftWeek(anchorDate: string, delta: number): string {
	return formatCalendarDate(addDays(parseCalendarDate(anchorDate), delta * 7));
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
