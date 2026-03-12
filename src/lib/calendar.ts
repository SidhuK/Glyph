import type {
	CalendarItem,
	CalendarNoteDateProperty,
	CalendarSource,
} from "./tauri";

export const CALENDAR_TAB_ID = "__glyph_calendar__";

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, {
	month: "long",
	year: "numeric",
});

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat(undefined, {
	weekday: "short",
});

export function isoDateFromLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function parseIsoDate(iso: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
	const [year, month, day] = iso.split("-").map(Number);
	if (
		!Number.isInteger(year) ||
		!Number.isInteger(month) ||
		!Number.isInteger(day)
	) {
		return null;
	}
	const value = new Date(year, month - 1, day);
	if (
		value.getFullYear() !== year ||
		value.getMonth() !== month - 1 ||
		value.getDate() !== day
	) {
		return null;
	}
	value.setHours(0, 0, 0, 0);
	return value;
}

export function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	next.setHours(0, 0, 0, 0);
	return next;
}

export function startOfMonth(date: Date): Date {
	const next = new Date(date.getFullYear(), date.getMonth(), 1);
	next.setHours(0, 0, 0, 0);
	return next;
}

export function startOfMonthGrid(month: Date): Date {
	const firstOfMonth = startOfMonth(month);
	return addDays(firstOfMonth, -firstOfMonth.getDay());
}

export function endOfMonthGrid(month: Date): Date {
	const firstOfMonth = startOfMonth(month);
	const lastOfMonth = new Date(
		firstOfMonth.getFullYear(),
		firstOfMonth.getMonth() + 1,
		0,
	);
	lastOfMonth.setHours(0, 0, 0, 0);
	return addDays(lastOfMonth, 6 - lastOfMonth.getDay());
}

export function buildMonthGridDates(month: Date): Date[] {
	const dates: Date[] = [];
	const cursor = startOfMonthGrid(month);
	const end = endOfMonthGrid(month);
	while (cursor <= end) {
		dates.push(new Date(cursor));
		cursor.setDate(cursor.getDate() + 1);
	}
	return dates;
}

export function formatMonthLabel(month: Date): string {
	return MONTH_LABEL_FORMATTER.format(month);
}

export function getWeekdayLabels(seed = new Date(2026, 2, 1)): string[] {
	return Array.from({ length: 7 }, (_, index) =>
		WEEKDAY_FORMATTER.format(addDays(seed, index)),
	);
}

export function isSameMonth(left: Date, right: Date): boolean {
	return (
		left.getFullYear() === right.getFullYear() &&
		left.getMonth() === right.getMonth()
	);
}

export function groupCalendarItemsByDate(items: CalendarItem[]) {
	const grouped = new Map<string, CalendarItem[]>();
	for (const item of items) {
		const existing = grouped.get(item.date);
		if (existing) {
			existing.push(item);
			continue;
		}
		grouped.set(item.date, [item]);
	}
	for (const entry of grouped.values()) {
		entry.sort((left, right) => left.title.localeCompare(right.title));
	}
	return grouped;
}

export function pickDefaultNoteDateProperty(
	properties: CalendarNoteDateProperty[],
	selectedKey: string | null,
	selectedKind: "date" | "datetime" | null,
): CalendarNoteDateProperty | null {
	if (selectedKey && selectedKind) {
		const selected = properties.find(
			(property) =>
				property.key === selectedKey && property.kind === selectedKind,
		);
		if (selected) return selected;
	}
	return properties[0] ?? null;
}

export function calendarSourceSummary(source: CalendarSource): string {
	if (source.kind === "space") return "Whole space";
	if (source.kind === "daily_notes") return "Daily notes folder";
	return source.path || "Folder";
}
