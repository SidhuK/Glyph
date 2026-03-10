import type { TaskBucket, TaskItem } from "./tauri";

export const TASKS_TAB_ID = "__glyph_tasks__";

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});

function parseIsoDateLocal(date: string): Date {
	const [year, month, day] = date.split("-").map(Number);
	return new Date(year, (month || 1) - 1, day || 1);
}

function differenceInCalendarDays(left: string, right: string): number {
	const leftDate = parseIsoDateLocal(left);
	const rightDate = parseIsoDateLocal(right);
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

export function formatTaskCalendarDate(date: string): string {
	return SHORT_DATE_FORMATTER.format(parseIsoDateLocal(date));
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

export function folderBreadcrumbFromNotePath(notePath: string): string {
	const normalized = notePath
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");
	if (!normalized) return "/";
	const lastSlash = normalized.lastIndexOf("/");
	if (lastSlash === -1) return "/";
	return normalized.slice(0, lastSlash + 1);
}

export type TaskDateTone = "default" | "today" | "upcoming" | "overdue";

export interface TaskDateBadge {
	kind: "due" | "scheduled";
	label: string;
	tone: TaskDateTone;
	date: string;
}

export interface TaskTimingSummary {
	badges: TaskDateBadge[];
	isOverdue: boolean;
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

	if (dueDate) {
		const diff = differenceInCalendarDays(dueDate, today);
		if (diff < 0) {
			badges.push({
				kind: "due",
				label: `Overdue ${Math.abs(diff)}d`,
				tone: "overdue",
				date: dueDate,
			});
		} else if (diff === 0) {
			badges.push({
				kind: "due",
				label: "Due today",
				tone: "today",
				date: dueDate,
			});
		} else if (diff === 1) {
			badges.push({
				kind: "due",
				label: "Due tomorrow",
				tone: "upcoming",
				date: dueDate,
			});
		} else if (diff <= 7) {
			badges.push({
				kind: "due",
				label: `Due in ${diff}d`,
				tone: "upcoming",
				date: dueDate,
			});
		} else {
			badges.push({
				kind: "due",
				label: `Due ${formatTaskCalendarDate(dueDate)}`,
				tone: "default",
				date: dueDate,
			});
		}
	}

	if (scheduledDate) {
		const diff = differenceInCalendarDays(scheduledDate, today);
		if (diff < 0) {
			badges.push({
				kind: "scheduled",
				label: `Started ${Math.abs(diff)}d ago`,
				tone: "overdue",
				date: scheduledDate,
			});
		} else if (diff === 0) {
			badges.push({
				kind: "scheduled",
				label: "Scheduled today",
				tone: "today",
				date: scheduledDate,
			});
		} else if (diff === 1) {
			badges.push({
				kind: "scheduled",
				label: "Starts tomorrow",
				tone: "upcoming",
				date: scheduledDate,
			});
		} else if (diff <= 7) {
			badges.push({
				kind: "scheduled",
				label: `Starts in ${diff}d`,
				tone: "upcoming",
				date: scheduledDate,
			});
		} else {
			badges.push({
				kind: "scheduled",
				label: `Starts ${formatTaskCalendarDate(scheduledDate)}`,
				tone: "default",
				date: scheduledDate,
			});
		}
	}

	return {
		badges,
		isOverdue: badges.some((badge) => badge.tone === "overdue"),
		hasDueDate: Boolean(dueDate),
		hasScheduledDate: Boolean(scheduledDate),
		nextDate: [dueDate, scheduledDate].filter(Boolean).sort()[0] ?? null,
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
	const nextDiff = futureDiffs[0] ?? 0;

	if (nextDiff === 1) {
		return { key: "tomorrow", label: "Tomorrow", order: 0 };
	}
	if (nextDiff <= 7) {
		return { key: "next-7", label: "Next 7 days", order: 1 };
	}
	return { key: "later", label: "Later", order: 2 };
}
