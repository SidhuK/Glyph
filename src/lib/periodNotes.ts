import { getTodayDateString, parseIsoDate } from "./dailyNotes";

export const PERIOD_KINDS = ["day", "week", "month", "quarter"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export type PeriodId =
	| { kind: "day"; date: string }
	| { kind: "week"; isoYear: number; week: number }
	| { kind: "month"; year: number; month: number }
	| { kind: "quarter"; year: number; quarter: number };

const WEEK_STEM_RE = /^(\d{4})-W(\d{2})$/;
const MONTH_STEM_RE = /^(\d{4})-(\d{2})$/;
const QUARTER_STEM_RE = /^(\d{4})-Q([1-4])$/;

function pad2(value: number): string {
	return String(value).padStart(2, "0");
}

function isAbsolutePath(p: string): boolean {
	return /^\/|^[A-Za-z]:[/\\]/.test(p);
}

export function isoWeekFromDate(date: Date): { isoYear: number; week: number } {
	const utc = new Date(
		Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
	);
	const day = utc.getUTCDay() || 7;
	utc.setUTCDate(utc.getUTCDate() + 4 - day);
	const isoYear = utc.getUTCFullYear();
	const yearStart = new Date(Date.UTC(isoYear, 0, 1));
	const week = Math.ceil(
		((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
	);
	return { isoYear, week };
}

export function mondayOfIsoWeek(isoYear: number, week: number): Date {
	const jan4 = new Date(isoYear, 0, 4);
	const weekday = jan4.getDay() || 7;
	const monday = new Date(isoYear, 0, 4 - weekday + 1);
	monday.setDate(monday.getDate() + (week - 1) * 7);
	monday.setHours(0, 0, 0, 0);
	return monday;
}

function isValidIsoWeek(isoYear: number, week: number): boolean {
	if (!Number.isInteger(isoYear) || !Number.isInteger(week)) return false;
	if (week < 1 || week > 53) return false;
	const monday = mondayOfIsoWeek(isoYear, week);
	const actual = isoWeekFromDate(monday);
	return actual.isoYear === isoYear && actual.week === week;
}

export function periodIdFromDate(kind: PeriodKind, date: Date): PeriodId {
	switch (kind) {
		case "day":
			return { kind: "day", date: getTodayDateString(date) };
		case "week": {
			const { isoYear, week } = isoWeekFromDate(date);
			return { kind: "week", isoYear, week };
		}
		case "month":
			return {
				kind: "month",
				year: date.getFullYear(),
				month: date.getMonth() + 1,
			};
		case "quarter":
			return {
				kind: "quarter",
				year: date.getFullYear(),
				quarter: Math.floor(date.getMonth() / 3) + 1,
			};
		default: {
			const _exhaustive: never = kind;
			return _exhaustive;
		}
	}
}

export function periodIdFromIsoDate(
	kind: PeriodKind,
	isoDate: string,
): PeriodId | null {
	const date = parseIsoDate(isoDate);
	if (!date) return null;
	return periodIdFromDate(kind, date);
}

export function periodStem(id: PeriodId): string {
	switch (id.kind) {
		case "day":
			return id.date;
		case "week":
			return `${id.isoYear}-W${pad2(id.week)}`;
		case "month":
			return `${id.year}-${pad2(id.month)}`;
		case "quarter":
			return `${id.year}-Q${id.quarter}`;
		default: {
			const _exhaustive: never = id;
			return _exhaustive;
		}
	}
}

export function parsePeriodStem(stem: string): PeriodId | null {
	if (parseIsoDate(stem)) {
		return { kind: "day", date: stem };
	}
	const weekMatch = WEEK_STEM_RE.exec(stem);
	if (weekMatch) {
		const isoYear = Number(weekMatch[1]);
		const week = Number(weekMatch[2]);
		if (!isValidIsoWeek(isoYear, week)) return null;
		return { kind: "week", isoYear, week };
	}
	const quarterMatch = QUARTER_STEM_RE.exec(stem);
	if (quarterMatch) {
		return {
			kind: "quarter",
			year: Number(quarterMatch[1]),
			quarter: Number(quarterMatch[2]),
		};
	}
	const monthMatch = MONTH_STEM_RE.exec(stem);
	if (monthMatch) {
		const year = Number(monthMatch[1]);
		const month = Number(monthMatch[2]);
		if (month < 1 || month > 12) return null;
		return { kind: "month", year, month };
	}
	return null;
}

export function periodAnchorDate(id: PeriodId): Date {
	switch (id.kind) {
		case "day": {
			const parsed = parseIsoDate(id.date);
			if (!parsed) {
				throw new Error(`Invalid day period: ${id.date}`);
			}
			return parsed;
		}
		case "week":
			return mondayOfIsoWeek(id.isoYear, id.week);
		case "month":
			return new Date(id.year, id.month - 1, 1);
		case "quarter":
			return new Date(id.year, (id.quarter - 1) * 3, 1);
		default: {
			const _exhaustive: never = id;
			return _exhaustive;
		}
	}
}

export function getPeriodNoteFilename(id: PeriodId): string {
	return `${periodStem(id)}.md`;
}

export function getPeriodNotePath(folder: string, id: PeriodId): string {
	if (isAbsolutePath(folder)) {
		throw new Error(
			`Dated note folder must be a relative path, got: ${folder}`,
		);
	}
	const filename = getPeriodNoteFilename(id);
	const normalizedFolder = folder.replace(/\\/g, "/").replace(/\/+$/g, "");
	const hasTraversal = normalizedFolder
		.split("/")
		.some((segment) => segment === "..");
	if (hasTraversal) {
		throw new Error(
			`Dated note folder cannot include parent traversal segments: ${folder}`,
		);
	}
	if (!normalizedFolder) {
		return filename;
	}
	return `${normalizedFolder}/${filename}`;
}

export function getPeriodNoteContent(id: PeriodId): string {
	return `# ${periodStem(id)}\n`;
}

export function getPeriodIdFromPath(
	path: string,
	folder: string,
): PeriodId | null {
	const normalizedPath = path.replace(/\\/g, "/");
	const normalizedFolder = folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
	const prefix = normalizedFolder ? `${normalizedFolder}/` : "";
	if (!normalizedPath.startsWith(prefix)) return null;
	const filename = normalizedPath.slice(prefix.length);
	if (filename.includes("/")) return null;
	const stem = filename.endsWith(".md") ? filename.slice(0, -3) : "";
	return parsePeriodStem(stem);
}

export const PERIOD_OPEN_COMMAND_IDS = {
	day: "open-daily-note",
	week: "open-weekly-note",
	month: "open-monthly-note",
	quarter: "open-quarterly-note",
} as const satisfies Record<PeriodKind, string>;
