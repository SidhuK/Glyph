/**
 * Global complete-date display preference.
 * Controls user-facing absolute calendar dates only; storage and compact/relative labels are unchanged.
 */

export type DateDisplayFormat = "us" | "european" | "friendly" | "iso";

export const DEFAULT_DATE_DISPLAY_FORMAT: DateDisplayFormat = "friendly";

/** Settings option labels with fixed examples for August 23, 2026. */
export const DATE_DISPLAY_FORMAT_OPTIONS = [
	{ value: "us", label: "US — 08/23/2026" },
	{ value: "european", label: "European — 23/08/2026" },
	{ value: "friendly", label: "Friendly — August 23, 2026" },
	{ value: "iso", label: "ISO — 2026-08-23" },
] as const satisfies readonly {
	value: DateDisplayFormat;
	label: string;
}[];

const ENGLISH_MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
] as const;

const ENGLISH_WEEKDAYS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
] as const;

/** Pure calendar-date string: YYYY-MM-DD (no time component). */
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateDisplayFormat(
	value: unknown,
): value is DateDisplayFormat {
	return (
		value === "us" ||
		value === "european" ||
		value === "friendly" ||
		value === "iso"
	);
}

export function normalizeDateDisplayFormat(value: unknown): DateDisplayFormat {
	return isDateDisplayFormat(value) ? value : DEFAULT_DATE_DISPLAY_FORMAT;
}

function pad2(value: number): string {
	return String(value).padStart(2, "0");
}

/**
 * Parse a display input into a local calendar Date.
 * Date-only `YYYY-MM-DD` stays on that calendar day in every time zone.
 * Timestamps keep normal local conversion of the instant.
 */
export function parseDisplayDateInput(
	value: string | number | Date,
): Date | null {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) return null;
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	const trimmed = value.trim();
	if (!trimmed) return null;

	const dateOnly = DATE_ONLY_PATTERN.exec(trimmed);
	if (dateOnly) {
		const year = Number(dateOnly[1]);
		const month = Number(dateOnly[2]);
		const day = Number(dateOnly[3]);
		// Date(year, …) maps 0–99 → 1900–1999; setFullYear keeps 0000–0099 as-is.
		const local = new Date(year, month - 1, day);
		local.setFullYear(year);
		if (
			local.getFullYear() !== year ||
			local.getMonth() !== month - 1 ||
			local.getDate() !== day
		) {
			return null;
		}
		return local;
	}

	const parsed = new Date(trimmed);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Format only the calendar-date portion for a known-valid Date. */
function formatCalendarDate(date: Date, format: DateDisplayFormat): string {
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	switch (format) {
		case "us":
			return `${pad2(month)}/${pad2(day)}/${year}`;
		case "european":
			return `${pad2(day)}/${pad2(month)}/${year}`;
		case "iso":
			return `${year}-${pad2(month)}-${pad2(day)}`;
		case "friendly":
			return `${ENGLISH_MONTHS[date.getMonth()]} ${day}, ${year}`;
	}
}

export interface FormatDisplayDateOptions {
	/** Prefix with long English weekday (e.g. "Monday, 08/23/2026"). */
	weekday?: boolean;
	/** Already-formatted clock time to append after the date (preserves surface convention). */
	time?: string;
}

/**
 * Format a complete absolute date for display.
 * On parse failure returns the original string input, or "" for non-string inputs.
 */
export function formatDisplayDate(
	input: string | number | Date,
	format: DateDisplayFormat,
	options?: FormatDisplayDateOptions,
): string {
	const date = parseDisplayDateInput(input);
	if (!date) {
		return typeof input === "string" ? input : "";
	}

	let out = formatCalendarDate(date, format);
	if (options?.weekday) {
		out = `${ENGLISH_WEEKDAYS[date.getDay()]}, ${out}`;
	}
	const time = options?.time?.trim();
	if (time) {
		out = `${out}, ${time}`;
	}
	return out;
}

/** Locale-default clock (hour + minute) for surfaces that used Intl with undefined locale. */
export function formatLocalClockTime(date: Date): string {
	return date.toLocaleString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});
}

/** en-US 12h lowercase clock used by database date-time labels. */
export function formatDatabaseClockTime(date: Date): string {
	return date
		.toLocaleString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		})
		.toLowerCase();
}
