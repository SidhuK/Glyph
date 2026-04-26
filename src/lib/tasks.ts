import { getTodayDateString, parseIsoDate } from "./dailyNotes";
import type { TaskItem } from "./tauri";

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});

function parseTaskDate(date: string | null | undefined): Date | null {
	return date ? parseIsoDate(date) : null;
}

function differenceInCalendarDays(
	left: string | null | undefined,
	right: string | null | undefined,
): number | null {
	const leftDate = parseTaskDate(left);
	const rightDate = parseTaskDate(right);
	if (!leftDate || !rightDate) return null;
	leftDate.setHours(0, 0, 0, 0);
	rightDate.setHours(0, 0, 0, 0);
	return Math.round(
		(leftDate.getTime() - rightDate.getTime()) / (1000 * 60 * 60 * 24),
	);
}

export function todayIsoDateLocal(now = new Date()): string {
	return getTodayDateString(now);
}

export function formatTaskCalendarDate(
	date: string | null | undefined,
): string | null {
	const parsed = parseTaskDate(date);
	if (!parsed) return null;
	return SHORT_DATE_FORMATTER.format(parsed);
}

export function stripTaskScheduleTokens(rawText: string): string {
	const tokens = rawText.split(/\s+/).filter(Boolean);
	const kept: string[] = [];
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		const nextToken = tokens[index + 1];
		if (
			(token === "📅" || token === "⏳") &&
			typeof nextToken === "string" &&
			/^\d{4}-\d{2}-\d{2}$/.test(nextToken)
		) {
			index += 1;
			continue;
		}
		kept.push(token);
	}
	return kept.join(" ");
}

export type TaskDateTone =
	| "default"
	| "today"
	| "upcoming"
	| "overdue"
	| "pastScheduled";

export interface TaskDateBadge {
	kind: "due" | "scheduled";
	label: string;
	tone: TaskDateTone;
	date: string;
}

export interface TaskTimingSummary {
	badges: TaskDateBadge[];
	isOverdue: boolean;
	isPastScheduled: boolean;
	hasDueDate: boolean;
	hasScheduledDate: boolean;
	nextDate: string | null;
}

export function getTaskTimingSummary(
	task: Pick<TaskItem, "due_date" | "scheduled_date">,
	today: string,
): TaskTimingSummary {
	const badges: TaskDateBadge[] = [];
	const dueDate = task.due_date;
	const scheduledDate = task.scheduled_date;
	const dueDiff = differenceInCalendarDays(dueDate, today);
	const scheduledDiff = differenceInCalendarDays(scheduledDate, today);
	const formattedDueDate = formatTaskCalendarDate(dueDate);
	const formattedScheduledDate = formatTaskCalendarDate(scheduledDate);

	if (dueDiff !== null && dueDate) {
		if (dueDiff < 0) {
			badges.push({
				kind: "due",
				label: `Overdue ${Math.abs(dueDiff)}d`,
				tone: "overdue",
				date: dueDate,
			});
		} else if (dueDiff === 0) {
			badges.push({
				kind: "due",
				label: "Due today",
				tone: "today",
				date: dueDate,
			});
		} else if (dueDiff === 1) {
			badges.push({
				kind: "due",
				label: "Due tomorrow",
				tone: "upcoming",
				date: dueDate,
			});
		} else if (dueDiff <= 7) {
			badges.push({
				kind: "due",
				label: `Due in ${dueDiff}d`,
				tone: "upcoming",
				date: dueDate,
			});
		} else {
			if (formattedDueDate) {
				badges.push({
					kind: "due",
					label: `Due ${formattedDueDate}`,
					tone: "default",
					date: dueDate,
				});
			}
		}
	}

	if (scheduledDiff !== null && scheduledDate) {
		if (scheduledDiff < 0) {
			badges.push({
				kind: "scheduled",
				label: `Started ${Math.abs(scheduledDiff)}d ago`,
				tone: "pastScheduled",
				date: scheduledDate,
			});
		} else if (scheduledDiff === 0) {
			badges.push({
				kind: "scheduled",
				label: "Scheduled today",
				tone: "today",
				date: scheduledDate,
			});
		} else if (scheduledDiff === 1) {
			badges.push({
				kind: "scheduled",
				label: "Starts tomorrow",
				tone: "upcoming",
				date: scheduledDate,
			});
		} else if (scheduledDiff <= 7) {
			badges.push({
				kind: "scheduled",
				label: `Starts in ${scheduledDiff}d`,
				tone: "upcoming",
				date: scheduledDate,
			});
		} else {
			if (formattedScheduledDate) {
				badges.push({
					kind: "scheduled",
					label: `Starts ${formattedScheduledDate}`,
					tone: "default",
					date: scheduledDate,
				});
			}
		}
	}

	return {
		badges,
		isOverdue: badges.some(
			(badge) => badge.tone === "overdue" && badge.kind === "due",
		),
		isPastScheduled: badges.some(
			(badge) => badge.tone === "pastScheduled" && badge.kind === "scheduled",
		),
		hasDueDate: dueDiff !== null,
		hasScheduledDate: scheduledDiff !== null,
		nextDate:
			[dueDate, scheduledDate]
				.filter((value): value is string =>
					Boolean(value && parseTaskDate(value)),
				)
				.sort()[0] ?? null,
	};
}
