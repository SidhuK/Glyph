import { type Day, addDays, endOfWeek, isAfter, startOfWeek, subWeeks } from "date-fns";
import { type ActivityDay, activityDateKey } from "./activityDays";

/** A calendar year, or `null` for the trailing year ending today. */
export type HeatmapPeriod = number | null;

type HeatmapLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatmapCell {
	dateKey: string;
	date: Date;
	count: number;
	level: HeatmapLevel;
}

export interface HeatmapWeek {
	key: string;
	/** Set on the column where a month begins. */
	monthStart: Date | null;
	/** Seven slots in week order; `null` pads days outside the period. */
	days: Array<HeatmapCell | null>;
}

interface BuildHeatmapInput {
	days: Map<string, ActivityDay>;
	period: HeatmapPeriod;
	today: Date;
	weekStartsOn: Day;
}

function periodBounds(period: HeatmapPeriod, today: Date, weekStartsOn: Day) {
	if (period === null) {
		return {
			start: startOfWeek(subWeeks(today, 52), { weekStartsOn }),
			end: today,
			gridEnd: endOfWeek(today, { weekStartsOn }),
		};
	}
	const yearEnd = new Date(period, 11, 31);
	return {
		start: new Date(period, 0, 1),
		end: isAfter(yearEnd, today) ? today : yearEnd,
		gridEnd: endOfWeek(yearEnd, { weekStartsOn }),
	};
}

/** GitHub-style quartiles over active days, so one bulk-edit day can't wash out the rest. */
function levelFor(count: number, thresholds: [number, number, number]): HeatmapLevel {
	if (count === 0) return 0;
	if (count <= thresholds[0]) return 1;
	if (count <= thresholds[1]) return 2;
	if (count <= thresholds[2]) return 3;
	return 4;
}

function quartiles(counts: number[]): [number, number, number] {
	const sorted = [...counts].sort((left, right) => left - right);
	const at = (fraction: number) => sorted[Math.floor((sorted.length - 1) * fraction)] ?? 0;
	return [at(0.25), at(0.5), at(0.75)];
}

export function buildHeatmap({ days, period, today, weekStartsOn }: BuildHeatmapInput) {
	const { start, end, gridEnd } = periodBounds(period, today, weekStartsOn);
	const weeks: HeatmapWeek[] = [];
	let week: HeatmapWeek | null = null;
	const cells: HeatmapCell[] = [];
	const notePaths = new Set<string>();

	for (
		let cursor = startOfWeek(start, { weekStartsOn });
		!isAfter(cursor, gridEnd);
		cursor = addDays(cursor, 1)
	) {
		const dateKey = activityDateKey(cursor);
		if (!week || week.days.length === 7) {
			week = { key: dateKey, monthStart: null, days: [] };
			weeks.push(week);
		}
		if (cursor < start || isAfter(cursor, end)) {
			week.days.push(null);
			continue;
		}
		const day = days.get(dateKey);
		const count = day?.notes.size ?? 0;
		for (const notePath of day?.notes.keys() ?? []) notePaths.add(notePath);
		if (cursor.getDate() === 1 || (cells.length === 0 && cursor.getDate() <= 14)) {
			week.monthStart = cursor;
		}
		const cell: HeatmapCell = { dateKey, date: cursor, count, level: 0 };
		cells.push(cell);
		week.days.push(cell);
	}

	const activeCounts = cells.filter((cell) => cell.count > 0).map((cell) => cell.count);
	const thresholds = quartiles(activeCounts);
	for (const cell of cells) cell.level = levelFor(cell.count, thresholds);

	return { weeks, stats: { notes: notePaths.size, activeDays: activeCounts.length } };
}

/** Newest first: the trailing year, then every calendar year back to the oldest activity. */
export function heatmapPeriods(days: Map<string, ActivityDay>, today: Date): HeatmapPeriod[] {
	let earliestYear = today.getFullYear();
	for (const day of days.values()) {
		earliestYear = Math.min(earliestYear, day.date.getFullYear());
	}
	const years = Array.from(
		{ length: today.getFullYear() - earliestYear + 1 },
		(_, index) => today.getFullYear() - index,
	);
	return [null, ...years];
}
