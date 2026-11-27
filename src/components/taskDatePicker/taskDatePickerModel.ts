import { type Day, addDays, isSameMonth, parseISO } from "date-fns";
import { parseNaturalDate, toIsoDate } from "../../lib/taskFields/naturalDate";
import { dateForNavigationKey } from "../app/calendar/monthGrid";

type TaskDatePresetId = "query" | "today" | "tomorrow" | "nextWeek";

export interface TaskDatePreset {
	id: TaskDatePresetId;
	isoDate: string;
}

type TaskDatePickerFocus = { kind: "preset"; index: number } | { kind: "day"; isoDate: string };

export interface TaskDatePickerView {
	focus: TaskDatePickerFocus;
	month: Date;
}

interface NavigationInput {
	key: string;
	view: TaskDatePickerView;
	presets: readonly TaskDatePreset[];
	firstGridDay: Date;
	gridEntryDate: Date;
	weekStartsOn: Day;
}

const DAYS_IN_WEEK = 7;

export function taskDatePresets(today: Date, query: string | undefined): TaskDatePreset[] {
	const queryDate = query ? parseNaturalDate(query, today) : null;
	const fixed: TaskDatePreset[] = [
		{ id: "today", isoDate: toIsoDate(today) },
		{ id: "tomorrow", isoDate: toIsoDate(addDays(today, 1)) },
		{ id: "nextWeek", isoDate: parseNaturalDate("next week", today) ?? toIsoDate(today) },
	];
	return queryDate ? [{ id: "query", isoDate: queryDate }, ...fixed] : fixed;
}

export function focusedIsoDate(
	focus: TaskDatePickerFocus,
	presets: readonly TaskDatePreset[],
): string | null {
	if (focus.kind === "day") return focus.isoDate;
	return presets[focus.index]?.isoDate ?? null;
}

function dayView(date: Date, month: Date): TaskDatePickerView {
	return {
		focus: { kind: "day", isoDate: toIsoDate(date) },
		month: isSameMonth(date, month) ? month : date,
	};
}

function navigatePresets(
	index: number,
	{ key, view, presets, gridEntryDate }: NavigationInput,
): TaskDatePickerView | null {
	if (key === "ArrowUp")
		return { ...view, focus: { kind: "preset", index: Math.max(0, index - 1) } };
	if (key !== "ArrowDown") return null;
	if (index < presets.length - 1) return { ...view, focus: { kind: "preset", index: index + 1 } };
	return dayView(gridEntryDate, view.month);
}

export function navigateTaskDatePicker(input: NavigationInput): TaskDatePickerView | null {
	const { key, view, presets, firstGridDay, weekStartsOn } = input;
	if (view.focus.kind === "preset") return navigatePresets(view.focus.index, input);
	const from = parseISO(view.focus.isoDate);
	if (key === "ArrowUp" && from < addDays(firstGridDay, DAYS_IN_WEEK)) {
		return { ...view, focus: { kind: "preset", index: presets.length - 1 } };
	}
	const next = dateForNavigationKey(key, from, weekStartsOn);
	return next ? dayView(next, view.month) : null;
}
