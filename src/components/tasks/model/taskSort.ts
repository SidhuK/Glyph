import type { TaskRecord } from "@/lib/tauri";
import { taskDisplayTitle } from "./taskTitle";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function compareNoteOrder(left: TaskRecord, right: TaskRecord): number {
	return collator.compare(left.note_path, right.note_path) || left.start - right.start;
}

export function compareDueAsc(left: TaskRecord, right: TaskRecord): number {
	if (left.due === right.due) return 0;
	if (left.due === null) return 1;
	if (right.due === null) return -1;
	return left.due < right.due ? -1 : 1;
}

export function compareByPriority(left: TaskRecord, right: TaskRecord): number {
	return (right.priority ?? -1) - (left.priority ?? -1);
}

export function compareTitle(left: TaskRecord, right: TaskRecord): number {
	return collator.compare(taskDisplayTitle(left), taskDisplayTitle(right));
}

export function compareText(left: string, right: string): number {
	return collator.compare(left, right);
}

export function sortedBy(
	records: readonly TaskRecord[],
	...comparers: ((left: TaskRecord, right: TaskRecord) => number)[]
): TaskRecord[] {
	return [...records].sort((left, right) => {
		for (const compare of comparers) {
			const result = compare(left, right);
			if (result !== 0) return result;
		}
		return compareNoteOrder(left, right);
	});
}
