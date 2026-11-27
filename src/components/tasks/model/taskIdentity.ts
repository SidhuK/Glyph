import type { TaskRecord } from "@/lib/tauri";

export function taskKey(record: Pick<TaskRecord, "note_path" | "start">): string {
	return `${record.note_path}\u0000${record.start}`;
}

function isSameTask(candidate: TaskRecord, target: TaskRecord): boolean {
	return (
		candidate.note_path === target.note_path &&
		candidate.indent === target.indent &&
		candidate.title === target.title
	);
}

function isCloserMatch(candidate: TaskRecord, best: TaskRecord, target: TaskRecord): boolean {
	const candidateExact = candidate.text === target.text;
	if (candidateExact !== (best.text === target.text)) return candidateExact;
	return Math.abs(candidate.start - target.start) < Math.abs(best.start - target.start);
}

export function findSameTask(
	records: readonly TaskRecord[],
	target: TaskRecord,
	claimed: ReadonlySet<TaskRecord> = new Set(),
): TaskRecord | null {
	let best: TaskRecord | null = null;
	for (const candidate of records) {
		if (claimed.has(candidate) || !isSameTask(candidate, target)) continue;
		if (!best || isCloserMatch(candidate, best, target)) best = candidate;
	}
	return best;
}

export function descendantsOf(records: readonly TaskRecord[], parent: TaskRecord): TaskRecord[] {
	const inNote = records.filter((record) => record.note_path === parent.note_path);
	const starts = new Set([parent.start]);
	const result: TaskRecord[] = [];
	for (const record of inNote.sort((a, b) => a.start - b.start)) {
		if (record.parent_start === null || !starts.has(record.parent_start)) continue;
		starts.add(record.start);
		result.push(record);
	}
	return result;
}

export function directChildrenOf(records: readonly TaskRecord[], parent: TaskRecord): TaskRecord[] {
	return records
		.filter(
			(record) => record.note_path === parent.note_path && record.parent_start === parent.start,
		)
		.sort((a, b) => a.start - b.start);
}
