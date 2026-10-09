import type { TaskItem, TaskNoteGroup } from "../../lib/tauri";

/** A checked task held on screen until the completion hold ends. */
interface CompletingTask {
	group: TaskNoteGroup;
	item: TaskItem;
	/** Key of the task the user checked; nested children share their parent's origin. */
	origin: string;
}

interface CompletingState {
	entries: ReadonlyMap<string, CompletingTask>;
	/** Group order when the burst started, so rows don't jump while a note's `updated` changes. */
	order: readonly string[];
}

export const EMPTY_COMPLETING: CompletingState = { entries: new Map(), order: [] };

export function taskKey(notePath: string, start: number): string {
	return `${notePath}\u0000${start}`;
}

/** The task at `start` plus every following item nested deeper than it. */
export function taskSubtree(group: TaskNoteGroup, start: number): TaskItem[] {
	const index = group.items.findIndex((item) => item.start === start);
	if (index < 0) return [];
	const target = group.items[index];
	let end = index + 1;
	while (end < group.items.length && group.items[end].indent > target.indent) end += 1;
	return group.items.slice(index, end);
}

/** Put tasks back into their groups (re-adding vanished groups), in document order. */
export function insertTasks(
	groups: readonly TaskNoteGroup[],
	entries: Iterable<CompletingTask>,
): TaskNoteGroup[] {
	const byNote = new Map<string, CompletingTask[]>();
	for (const entry of entries) {
		const list = byNote.get(entry.group.note_path) ?? [];
		list.push(entry);
		byNote.set(entry.group.note_path, list);
	}
	const merge = (group: TaskNoteGroup, extra: CompletingTask[]): TaskNoteGroup => {
		const starts = new Set(group.items.map((item) => item.start));
		const missing = extra.map((entry) => entry.item).filter((item) => !starts.has(item.start));
		if (missing.length === 0) return group;
		const items = [...group.items, ...missing].sort((a, b) => a.start - b.start);
		return { ...group, items };
	};
	const result = groups.map((group) => {
		const extra = byNote.get(group.note_path);
		if (!extra) return group;
		byNote.delete(group.note_path);
		return merge(group, extra);
	});
	for (const extra of byNote.values()) {
		result.push(merge({ ...extra[0].group, items: [] }, extra));
	}
	return result;
}

/** Displayed groups: server data plus held tasks, in the order the burst started with. */
export function withCompleting(
	groups: readonly TaskNoteGroup[],
	completing: CompletingState,
): readonly TaskNoteGroup[] {
	if (completing.entries.size === 0) return groups;
	const merged = insertTasks(groups, completing.entries.values());
	const rank = new Map(completing.order.map((path, index) => [path, index]));
	const position = (group: TaskNoteGroup) => rank.get(group.note_path) ?? -1;
	return merged.sort((a, b) => position(a) - position(b));
}

type CompletionAction =
	| { type: "complete"; tasks: CompletingTask[]; order: readonly string[] }
	/** Release every held task checked by `origin` (undo, or a failed write). */
	| { type: "drop"; origin: string }
	| { type: "saved"; notePath: string; etag: string }
	| { type: "flush" };

function withEntries(state: CompletingState, entries: Map<string, CompletingTask>) {
	return { entries, order: entries.size === 0 ? [] : state.order };
}

export function completionReducer(
	state: CompletingState,
	action: CompletionAction,
): CompletingState {
	const entries = new Map(state.entries);
	switch (action.type) {
		case "complete":
			// A child already held keeps its own origin, so undoing this click
			// reopens only what this click changed.
			for (const task of action.tasks) {
				const key = taskKey(task.group.note_path, task.item.start);
				if (!entries.has(key)) entries.set(key, task);
			}
			return { entries, order: state.entries.size === 0 ? action.order : state.order };
		case "drop":
			for (const [key, entry] of entries) if (entry.origin === action.origin) entries.delete(key);
			return withEntries(state, entries);
		case "saved":
			for (const [key, entry] of entries) {
				if (entry.group.note_path !== action.notePath) continue;
				entries.set(key, { ...entry, group: { ...entry.group, etag: action.etag } });
			}
			return withEntries(state, entries);
		case "flush":
			return EMPTY_COMPLETING;
	}
}
