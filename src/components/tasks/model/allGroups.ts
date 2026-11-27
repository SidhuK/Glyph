import type { TFunction } from "i18next";
import type { TaskRecord } from "@/lib/tauri";
import { parentDir } from "@/utils/path";
import { dueTone } from "./taskDates";
import type { TaskGroupBy } from "./taskDisplay";
import { priorityLabelKey, priorityLevel } from "./taskPriority";
import type { TaskSectionIcon } from "./taskRows";
import { compareText } from "./taskSort";
import { TASK_STATUS_KINDS } from "@/lib/taskFields/taskStatus";
import { taskNoteTitle } from "./taskTitle";

interface TaskGroup {
	id: string;
	label: string;
	detail: string | null;
	icon: TaskSectionIcon | null;
	members: TaskRecord[];
}

type GroupSeed = Omit<TaskGroup, "members"> & { rank: number | string };

const DUE_BUCKETS = ["overdue", "today", "tomorrow", "week", "later", "none"] as const;
const PRIORITY_RANKS = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 } as const;
const NO_TAGS_RANK = "￿";

interface GroupContext {
	today: string;
	t: TFunction<"shell">;
}

function seedsFor(
	record: TaskRecord,
	groupBy: TaskGroupBy,
	{ today, t }: GroupContext,
): GroupSeed[] {
	switch (groupBy) {
		case "note":
			return [
				{
					id: `note:${record.note_path}`,
					label: taskNoteTitle(record),
					detail: parentDir(record.note_path) || null,
					icon: { kind: "note" },
					rank: record.note_path,
				},
			];
		case "status":
			return [
				{
					id: `status:${record.status_kind}`,
					label: t(`tasks.status.${record.status_kind}`),
					detail: null,
					icon: { kind: "status", status: record.status_kind },
					rank: [1, 0, 2, 3][TASK_STATUS_KINDS.indexOf(record.status_kind)] ?? 0,
				},
			];
		case "due": {
			const bucket = record.due === null ? "none" : dueTone(record.due, today);
			return [
				{
					id: `due:${bucket}`,
					label: t(`tasks.dueGroups.${bucket}`),
					detail: null,
					icon: { kind: "due" },
					rank: DUE_BUCKETS.indexOf(bucket),
				},
			];
		}
		case "priority": {
			const level = priorityLevel(record.priority) ?? "none";
			return [
				{
					id: `priority:${level}`,
					label: t(priorityLabelKey(record.priority)),
					detail: null,
					icon: { kind: "priority", priority: record.priority },
					rank: PRIORITY_RANKS[level],
				},
			];
		}
		case "tag":
			if (record.tags.length === 0) {
				return [
					{
						id: "tag:",
						label: t("tasks.noTags"),
						detail: null,
						icon: { kind: "tag" },
						rank: NO_TAGS_RANK,
					},
				];
			}
			return record.tags.map((tag) => ({
				id: `tag:${tag}`,
				label: `#${tag}`,
				detail: null,
				icon: { kind: "tag" },
				rank: tag,
			}));
		case "none":
			return [{ id: "all", label: "", detail: null, icon: null, rank: 0 }];
	}
}

function compareRank(left: number | string, right: number | string): number {
	if (typeof left === "number" && typeof right === "number") return left - right;
	return compareText(String(left), String(right));
}

export function groupTasks(
	records: readonly TaskRecord[],
	groupBy: TaskGroupBy,
	context: GroupContext,
): TaskGroup[] {
	const groups = new Map<string, GroupSeed & { members: TaskRecord[] }>();
	for (const record of records) {
		for (const seed of seedsFor(record, groupBy, context)) {
			const existing = groups.get(seed.id);
			if (existing) existing.members.push(record);
			else groups.set(seed.id, { ...seed, members: [record] });
		}
	}
	return [...groups.values()]
		.sort((left, right) => compareRank(left.rank, right.rank))
		.map(({ rank: _rank, ...group }) => group);
}
