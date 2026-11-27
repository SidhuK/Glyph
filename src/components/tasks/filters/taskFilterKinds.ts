import {
	Calendar03Icon,
	CalendarRemove01Icon,
	CircleIcon,
	File01Icon,
	Flag01Icon,
	Folder01Icon,
	Tag01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { TaskFilterState } from "../viewState/taskViewState";

export const TASK_FILTER_KINDS = [
	"note",
	"folder",
	"tag",
	"status",
	"priority",
	"dueBefore",
	"dueAfter",
	"dueNone",
] as const;

export type TaskFilterKind = (typeof TASK_FILTER_KINDS)[number];

export const TASK_FILTER_ICONS = {
	note: File01Icon,
	folder: Folder01Icon,
	tag: Tag01Icon,
	status: CircleIcon,
	priority: Flag01Icon,
	dueBefore: Calendar03Icon,
	dueAfter: Calendar03Icon,
	dueNone: CalendarRemove01Icon,
} as const satisfies Record<TaskFilterKind, IconSvgElement>;

export function isFilterActive(kind: TaskFilterKind, filters: TaskFilterState): boolean {
	switch (kind) {
		case "note":
			return filters.note_paths.length > 0;
		case "folder":
			return filters.folder_prefixes.length > 0;
		case "tag":
			return filters.tags.length > 0;
		case "status":
			return filters.statuses.length > 0;
		case "priority":
			return filters.priorities.length > 0 || filters.include_no_priority;
		case "dueBefore":
			return filters.due_before !== null;
		case "dueAfter":
			return filters.due_after !== null;
		case "dueNone":
			return filters.due_none;
	}
}

export function hasActiveFilters(filters: TaskFilterState): boolean {
	return TASK_FILTER_KINDS.some((kind) => isFilterActive(kind, filters));
}

export function clearFilter(kind: TaskFilterKind, filters: TaskFilterState): TaskFilterState {
	switch (kind) {
		case "note":
			return { ...filters, note_paths: [] };
		case "folder":
			return { ...filters, folder_prefixes: [] };
		case "tag":
			return { ...filters, tags: [] };
		case "status":
			return { ...filters, statuses: [] };
		case "priority":
			return { ...filters, priorities: [], include_no_priority: false };
		case "dueBefore":
			return { ...filters, due_before: null };
		case "dueAfter":
			return { ...filters, due_after: null };
		case "dueNone":
			return { ...filters, due_none: false };
	}
}

export function toggledValue<Value>(values: readonly Value[], value: Value): Value[] {
	return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function filterOperator(kind: TaskFilterKind): "in" | "is" | null {
	switch (kind) {
		case "note":
		case "folder":
			return "in";
		case "tag":
		case "status":
		case "priority":
			return "is";
		case "dueBefore":
		case "dueAfter":
		case "dueNone":
			return null;
	}
}
