import type { TaskBucket, TaskItem } from "./tauri";

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});

function getDaysInMonth(year: number, month: number): number {
	return new Date(year, month, 0).getDate();
}

function parseIsoDateLocal(date: string | null | undefined): Date | null {
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	const [year, month, day] = date.split("-").map(Number);
	if (
		!Number.isInteger(year) ||
		!Number.isInteger(month) ||
		!Number.isInteger(day) ||
		month < 1 ||
		month > 12
	) {
		return null;
	}
	const maxDay = getDaysInMonth(year, month);
	if (day < 1 || day > maxDay) {
		return null;
	}
	return new Date(year, month - 1, day);
}

function differenceInCalendarDays(
	left: string | null | undefined,
	right: string | null | undefined,
): number | null {
	const leftDate = parseIsoDateLocal(left);
	const rightDate = parseIsoDateLocal(right);
	if (!leftDate || !rightDate) return null;
	leftDate.setHours(0, 0, 0, 0);
	rightDate.setHours(0, 0, 0, 0);
	return Math.round(
		(leftDate.getTime() - rightDate.getTime()) / (1000 * 60 * 60 * 24),
	);
}

export function todayIsoDateLocal(now = new Date()): string {
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function compareIsoDates(
	left: string | null,
	right: string | null,
): number {
	if (left === right) return 0;
	if (!left) return 1;
	if (!right) return -1;
	return left.localeCompare(right);
}

export function formatTaskCalendarDate(
	date: string | null | undefined,
): string | null {
	const parsed = parseIsoDateLocal(date);
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

export interface TaskGroupDescriptor {
	key: string;
	label: string;
	order: number;
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
					Boolean(value && parseIsoDateLocal(value)),
				)
				.sort()[0] ?? null,
	};
}

export function getTaskTimeGroup(
	task: Pick<TaskItem, "due_date" | "scheduled_date">,
	bucket: TaskBucket,
	today: string,
): TaskGroupDescriptor {
	const dueDiff = task.due_date
		? differenceInCalendarDays(task.due_date, today)
		: null;
	const scheduledDiff = task.scheduled_date
		? differenceInCalendarDays(task.scheduled_date, today)
		: null;

	if (bucket === "today") {
		if (
			(dueDiff !== null && dueDiff < 0) ||
			(scheduledDiff !== null && scheduledDiff < 0)
		) {
			return { key: "overdue", label: "Overdue", order: 0 };
		}
		return { key: "today", label: "Today", order: 1 };
	}

	const futureDiffs = [dueDiff, scheduledDiff]
		.filter((value): value is number => value !== null && value > 0)
		.sort((left, right) => left - right);
	const nextDiff = futureDiffs[0] ?? null;

	if (nextDiff === null) {
		return { key: "later", label: "Later", order: 2 };
	}

	if (nextDiff === 1) {
		return { key: "tomorrow", label: "Tomorrow", order: 0 };
	}
	if (nextDiff <= 7) {
		return { key: "next-7", label: "Next 7 days", order: 1 };
	}
	return { key: "later", label: "Later", order: 2 };
}
