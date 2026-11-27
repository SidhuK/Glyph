import { addDays, addWeeks, format, isBefore, isValid, startOfDay, startOfWeek } from "date-fns";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_FIRST_PATTERN = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?$/;
const DAY_FIRST_PATTERN = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?$/;
const NEXT_WEEKDAY_PATTERN = /^next\s+([a-z]+)\.?$/;
const DAYS_IN_WEEK = 7;
const MONDAY = 1;

const WEEKDAY_NAMES: ReadonlyArray<readonly string[]> = [
	["sunday", "sun"],
	["monday", "mon"],
	["tuesday", "tue", "tues"],
	["wednesday", "wed"],
	["thursday", "thu", "thur", "thurs"],
	["friday", "fri"],
	["saturday", "sat"],
];

const MONTH_NAMES: ReadonlyArray<readonly string[]> = [
	["january", "jan"],
	["february", "feb"],
	["march", "mar"],
	["april", "apr"],
	["may"],
	["june", "jun"],
	["july", "jul"],
	["august", "aug"],
	["september", "sep", "sept"],
	["october", "oct"],
	["november", "nov"],
	["december", "dec"],
];

export function toIsoDate(date: Date): string {
	return format(date, "yyyy-MM-dd");
}

function indexOfName(names: ReadonlyArray<readonly string[]>, word: string): number | null {
	const index = names.findIndex((aliases) => aliases.includes(word));
	return index === -1 ? null : index;
}

function weekdayIndex(word: string): number | null {
	return indexOfName(WEEKDAY_NAMES, word);
}

function monthIndex(word: string): number | null {
	return indexOfName(MONTH_NAMES, word);
}

function calendarDate(year: number, month: number, day: number): Date | null {
	const date = new Date(year, month, day);
	if (!isValid(date)) return null;
	const matches =
		date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
	return matches ? date : null;
}

function nextWeekday(today: Date, weekday: number): Date {
	const distance = (weekday - today.getDay() + DAYS_IN_WEEK) % DAYS_IN_WEEK;
	return addDays(today, distance === 0 ? DAYS_IN_WEEK : distance);
}

function weekdayOfNextWeek(today: Date, weekday: number): Date {
	const nextWeekStart = startOfWeek(addWeeks(today, 1), { weekStartsOn: MONDAY });
	const offset = (weekday - MONDAY + DAYS_IN_WEEK) % DAYS_IN_WEEK;
	return addDays(nextWeekStart, offset);
}

function nextMonthDay(today: Date, month: number | null, day: number): Date | null {
	if (month === null) return null;
	const thisYear = calendarDate(today.getFullYear(), month, day);
	if (thisYear && !isBefore(thisYear, today)) return thisYear;
	return calendarDate(today.getFullYear() + 1, month, day);
}

function parseIsoDate(text: string): Date | null {
	const match = ISO_DATE_PATTERN.exec(text);
	if (!match) return null;
	return calendarDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function resolveRelativeWord(text: string, today: Date): Date | null {
	if (text === "today") return today;
	if (text === "tomorrow") return addDays(today, 1);
	if (text === "next week") return weekdayOfNextWeek(today, MONDAY);
	const weekday = weekdayIndex(text);
	if (weekday !== null) return nextWeekday(today, weekday);
	const nextMatch = NEXT_WEEKDAY_PATTERN.exec(text);
	if (!nextMatch) return null;
	const nextWeekdayIndex = weekdayIndex(nextMatch[1]);
	return nextWeekdayIndex === null ? null : weekdayOfNextWeek(today, nextWeekdayIndex);
}

function resolveMonthDay(text: string, today: Date): Date | null {
	const monthFirst = MONTH_FIRST_PATTERN.exec(text);
	if (monthFirst) return nextMonthDay(today, monthIndex(monthFirst[1]), Number(monthFirst[2]));
	const dayFirst = DAY_FIRST_PATTERN.exec(text);
	if (dayFirst) return nextMonthDay(today, monthIndex(dayFirst[2]), Number(dayFirst[1]));
	return null;
}

export function isValidIsoDate(value: string): boolean {
	return parseIsoDate(value) !== null;
}

export function parseNaturalDate(input: string, today: Date): string | null {
	const text = input.trim().toLowerCase().replace(/\s+/g, " ");
	if (!text) return null;
	const base = startOfDay(today);
	const resolved =
		parseIsoDate(text) ?? resolveRelativeWord(text, base) ?? resolveMonthDay(text, base);
	return resolved ? toIsoDate(resolved) : null;
}
