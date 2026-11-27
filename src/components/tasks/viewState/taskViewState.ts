import {
	getSettingsStore,
	saveSettingsStore,
	withSettingsStoreWriteLock,
} from "@/lib/settingsStore";
import { isValidIsoDate } from "@/lib/taskFields/naturalDate";
import { isTaskPriority } from "@/lib/taskFields/taskPriority";
import type { TaskQueryFilters } from "@/lib/tauri";
import {
	DEFAULT_TASK_DISPLAY,
	TASK_GROUP_BY,
	TASK_LAYOUTS,
	TASK_ORDER_BY,
	type TaskDisplayState,
} from "../model/taskDisplay";
import { TASK_STATUS_KINDS } from "@/lib/taskFields/taskStatus";

const TASK_VIEW_STATE_BY_SPACE_KEY = "tasks.viewStateBySpace";
const TASK_VIEW_STATE_VERSION = 1;

export type TaskFilterState = Omit<TaskQueryFilters, "include_done">;

export interface TaskViewState {
	version: typeof TASK_VIEW_STATE_VERSION;
	filters: TaskFilterState;
	display: TaskDisplayState;
}

export const EMPTY_TASK_FILTERS: TaskFilterState = {
	note_paths: [],
	folder_prefixes: [],
	tags: [],
	statuses: [],
	priorities: [],
	include_no_priority: false,
	due_before: null,
	due_after: null,
	due_none: false,
};

export const DEFAULT_TASK_VIEW_STATE: TaskViewState = {
	version: TASK_VIEW_STATE_VERSION,
	filters: EMPTY_TASK_FILTERS,
	display: DEFAULT_TASK_DISPLAY,
};

function isIsoDate(value: unknown): value is string {
	return typeof value === "string" && isValidIsoDate(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [
		...new Set(
			value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== ""),
		),
	];
}

function oneOf<const T extends string>(options: readonly T[], value: unknown, fallback: T): T {
	return options.find((option) => option === value) ?? fallback;
}

function normalizeFilters(value: unknown): TaskFilterState {
	if (!isRecord(value)) return EMPTY_TASK_FILTERS;
	const statuses = Array.isArray(value.statuses) ? value.statuses : [];
	const priorities = Array.isArray(value.priorities) ? value.priorities : [];
	return {
		note_paths: stringList(value.note_paths),
		folder_prefixes: stringList(value.folder_prefixes),
		tags: stringList(value.tags),
		statuses: TASK_STATUS_KINDS.filter((kind) => statuses.includes(kind)),
		priorities: [...new Set(priorities.filter(isTaskPriority))],
		include_no_priority: value.include_no_priority === true,
		due_before: isIsoDate(value.due_before) ? value.due_before : null,
		due_after: isIsoDate(value.due_after) ? value.due_after : null,
		due_none: value.due_none === true,
	};
}

function normalizeDisplay(value: unknown): TaskDisplayState {
	if (!isRecord(value)) return DEFAULT_TASK_DISPLAY;
	return {
		groupBy: oneOf(TASK_GROUP_BY, value.groupBy, DEFAULT_TASK_DISPLAY.groupBy),
		orderBy: oneOf(TASK_ORDER_BY, value.orderBy, DEFAULT_TASK_DISPLAY.orderBy),
		showSubtasks: value.showSubtasks === true,
		includeDone: value.includeDone === true,
		layout: oneOf(TASK_LAYOUTS, value.layout, DEFAULT_TASK_DISPLAY.layout),
	};
}

function normalizeTaskViewState(value: unknown): TaskViewState {
	if (!isRecord(value) || value.version !== TASK_VIEW_STATE_VERSION) return DEFAULT_TASK_VIEW_STATE;
	return {
		version: TASK_VIEW_STATE_VERSION,
		filters: normalizeFilters(value.filters),
		display: normalizeDisplay(value.display),
	};
}

function normalizeStateMap(value: unknown): Record<string, TaskViewState> {
	if (!isRecord(value)) return {};
	const out: Record<string, TaskViewState> = {};
	for (const [spacePath, state] of Object.entries(value)) {
		if (spacePath.trim()) out[spacePath] = normalizeTaskViewState(state);
	}
	return out;
}

export async function loadTaskViewState(spacePath: string): Promise<TaskViewState> {
	const store = await getSettingsStore();
	const bySpace = normalizeStateMap(await store.get<unknown>(TASK_VIEW_STATE_BY_SPACE_KEY));
	return bySpace[spacePath] ?? DEFAULT_TASK_VIEW_STATE;
}

export function saveTaskViewState(spacePath: string, state: TaskViewState): Promise<void> {
	return withSettingsStoreWriteLock(async () => {
		const store = await getSettingsStore();
		const bySpace = normalizeStateMap(await store.get<unknown>(TASK_VIEW_STATE_BY_SPACE_KEY));
		bySpace[spacePath] = state;
		await store.set(TASK_VIEW_STATE_BY_SPACE_KEY, bySpace);
		await saveSettingsStore(store);
	});
}
