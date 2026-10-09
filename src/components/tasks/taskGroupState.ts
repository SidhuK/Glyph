import {
	getSettingsStore,
	saveSettingsStore,
	withSettingsStoreWriteLock,
} from "../../lib/settingsStore";

/** Same store and per-space map shape as `workspace.sessionBySpace` (lib/workspaceSession.ts). */
const TASK_GROUP_STATE_BY_SPACE_KEY = "tasks.groupStateBySpace";

export interface TaskGroupState {
	version: 1;
	/** Expanded state for notes without an override; groups start collapsed. */
	defaultExpanded: boolean;
	/** Per-note choices that differ from `defaultExpanded`. */
	overrides: Record<string, boolean>;
}

export const DEFAULT_TASK_GROUP_STATE: TaskGroupState = {
	version: 1,
	defaultExpanded: false,
	overrides: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTaskGroupState(value: unknown): TaskGroupState {
	if (!isRecord(value) || value.version !== 1) return DEFAULT_TASK_GROUP_STATE;
	const defaultExpanded = value.defaultExpanded === true;
	const overrides: Record<string, boolean> = {};
	if (isRecord(value.overrides)) {
		for (const [path, expanded] of Object.entries(value.overrides)) {
			if (path && typeof expanded === "boolean" && expanded !== defaultExpanded) {
				overrides[path] = expanded;
			}
		}
	}
	return { version: 1, defaultExpanded, overrides };
}

function normalizeStateMap(value: unknown): Record<string, TaskGroupState> {
	if (!isRecord(value)) return {};
	const out: Record<string, TaskGroupState> = {};
	for (const [spacePath, state] of Object.entries(value)) {
		if (spacePath.trim()) out[spacePath] = normalizeTaskGroupState(state);
	}
	return out;
}

export async function loadTaskGroupState(spacePath: string): Promise<TaskGroupState> {
	const store = await getSettingsStore();
	const bySpace = normalizeStateMap(await store.get<unknown>(TASK_GROUP_STATE_BY_SPACE_KEY));
	return bySpace[spacePath] ?? DEFAULT_TASK_GROUP_STATE;
}

export function saveTaskGroupState(spacePath: string, state: TaskGroupState): Promise<void> {
	return withSettingsStoreWriteLock(async () => {
		const store = await getSettingsStore();
		const bySpace = normalizeStateMap(await store.get<unknown>(TASK_GROUP_STATE_BY_SPACE_KEY));
		bySpace[spacePath] = state;
		await store.set(TASK_GROUP_STATE_BY_SPACE_KEY, bySpace);
		await saveSettingsStore(store);
	});
}

export function isGroupExpanded(state: TaskGroupState, notePath: string): boolean {
	return state.overrides[notePath] ?? state.defaultExpanded;
}

export function withGroupToggled(state: TaskGroupState, notePath: string): TaskGroupState {
	const expanded = !isGroupExpanded(state, notePath);
	const overrides = { ...state.overrides };
	if (expanded === state.defaultExpanded) delete overrides[notePath];
	else overrides[notePath] = expanded;
	return { ...state, overrides };
}

/** Drop overrides for notes that no longer have open tasks. */
export function withKnownOverrides(
	state: TaskGroupState,
	groups: readonly { note_path: string }[],
): TaskGroupState {
	const known = new Set(groups.map((group) => group.note_path));
	const overrides = Object.fromEntries(
		Object.entries(state.overrides).filter(([path]) => known.has(path)),
	);
	return { ...state, overrides };
}

export function withAllGroups(expanded: boolean): TaskGroupState {
	return { version: 1, defaultExpanded: expanded, overrides: {} };
}
