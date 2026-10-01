import { format, parseISO, startOfDay } from "date-fns";
import { getDailyNoteDateFromPath } from "../../../lib/dailyNotes";
import type { AllDocsItem } from "../../../lib/tauri";

interface ActivityNote {
	note: AllDocsItem;
	isDaily: boolean;
	/** Created on this day; otherwise this day is its latest edit. */
	created: boolean;
}

export interface ActivityDay {
	dateKey: string;
	date: Date;
	notes: Map<string, ActivityNote>;
}

export function activityDateKey(date: Date): string {
	return format(date, "yyyy-MM-dd");
}

function parseDateKey(value: string): string | null {
	const parsed = parseISO(value);
	return Number.isNaN(parsed.getTime()) ? null : activityDateKey(parsed);
}

export function buildActivityDays(
	notes: AllDocsItem[],
	dailyNotesFolder: string | null,
): Map<string, ActivityDay> {
	const days = new Map<string, ActivityDay>();

	const addNote = (key: string, note: AllDocsItem, created: boolean, dailyDate: string | null) => {
		let day = days.get(key);
		if (!day) {
			day = { dateKey: key, date: startOfDay(parseISO(key)), notes: new Map() };
			days.set(key, day);
		}
		const existing = day.notes.get(note.note_path);
		if (existing) existing.created ||= created;
		else day.notes.set(note.note_path, { note, isDaily: dailyDate === key, created });
	};

	for (const note of notes) {
		const dailyDate = dailyNotesFolder
			? getDailyNoteDateFromPath(note.note_path, dailyNotesFolder)
			: null;
		const createdKey = parseDateKey(note.created);
		const updatedKey = parseDateKey(note.updated);
		if (createdKey) addNote(createdKey, note, true, dailyDate);
		if (updatedKey) addNote(updatedKey, note, false, dailyDate);
	}

	return days;
}

/** Days with activity, newest first. */
export function daysNewestFirst(days: Map<string, ActivityDay>): ActivityDay[] {
	return [...days.values()].sort((left, right) => right.date.getTime() - left.date.getTime());
}

/** Daily note first, then most recently edited. */
export function sortedDayNotes(day: ActivityDay): ActivityNote[] {
	return [...day.notes.values()].sort((left, right) => {
		if (left.isDaily !== right.isDaily) return left.isDaily ? -1 : 1;
		return Date.parse(right.note.updated) - Date.parse(left.note.updated);
	});
}
