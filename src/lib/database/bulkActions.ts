import { databaseCellValueFromRow, isColumnEditable } from "./config";
import type { DatabaseCellValue, DatabaseColumn, DatabaseRow } from "./types";

export interface BulkEligibleColumns {
	statusColumn: DatabaseColumn | null;
	priorityColumn: DatabaseColumn | null;
	checkboxColumns: DatabaseColumn[];
	tagsColumns: DatabaseColumn[];
}

export function findBulkEligibleColumns(
	columns: DatabaseColumn[],
): BulkEligibleColumns {
	let statusColumn: DatabaseColumn | null = null;
	let priorityColumn: DatabaseColumn | null = null;
	const checkboxColumns: DatabaseColumn[] = [];
	const tagsColumns: DatabaseColumn[] = [];

	for (const column of columns) {
		if (!isColumnEditable(column)) continue;
		if (column.type === "tags") {
			tagsColumns.push(column);
			continue;
		}
		if (column.type !== "property") continue;
		if (column.property_kind === "status" && !statusColumn) {
			statusColumn = column;
		} else if (column.property_kind === "priority" && !priorityColumn) {
			priorityColumn = column;
		} else if (column.property_kind === "checkbox") {
			checkboxColumns.push(column);
		} else if (column.property_kind === "tags") {
			tagsColumns.push(column);
		}
	}

	return { statusColumn, priorityColumn, checkboxColumns, tagsColumns };
}

export function pruneRowSelection<T extends Record<string, boolean>>(
	selection: T,
	visiblePaths: Iterable<string>,
): T {
	const visible = new Set(visiblePaths);
	let changed = false;
	const next = { ...selection };
	for (const path of Object.keys(next)) {
		if (!visible.has(path)) {
			delete next[path];
			changed = true;
		}
	}
	return changed ? next : selection;
}

function tagKey(tag: string): string {
	return tag.trim().toLowerCase();
}

export function mergeTagLists(existing: string[], toAdd: string[]): string[] {
	const seen = new Set<string>();
	const merged: string[] = [];
	for (const tag of [...existing, ...toAdd]) {
		const trimmed = tag.trim();
		if (!trimmed) continue;
		const key = tagKey(trimmed);
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(trimmed);
	}
	return merged;
}

export function removeTagsFromList(
	existing: string[],
	toRemove: string[],
): string[] {
	const removeKeys = new Set(
		toRemove.map((tag) => tagKey(tag)).filter((key) => key.length > 0),
	);
	return existing.filter((tag) => !removeKeys.has(tagKey(tag)));
}

export function tagsCellValueForRow(
	row: DatabaseRow,
	column: DatabaseColumn,
): DatabaseCellValue {
	const cell = databaseCellValueFromRow(row, column);
	if (cell.kind === "tags") return cell;
	return {
		kind: "tags",
		value_list: cell.value_list,
	};
}

export function buildTagsCellValue(
	row: DatabaseRow,
	column: DatabaseColumn,
	nextTags: string[],
): DatabaseCellValue {
	const cell = tagsCellValueForRow(row, column);
	return {
		kind: "tags",
		value_list: nextTags,
		value_text: cell.value_text,
		value_bool: cell.value_bool,
	};
}

export interface SelectedRowTagOption {
	tag: string;
	count: number;
}

export function collectSelectedRowTextValues(
	rows: DatabaseRow[],
	selectedRowPaths: string[],
	column: DatabaseColumn,
): string[] {
	const selectedPaths = new Set(selectedRowPaths);
	const values: string[] = [];
	for (const row of rows) {
		if (!selectedPaths.has(row.note_path)) continue;
		const text = databaseCellValueFromRow(row, column).value_text?.trim();
		if (text) values.push(text);
	}
	return values;
}

export function collectSelectedRowTags(
	rows: DatabaseRow[],
	selectedRowPaths: string[],
	column: DatabaseColumn,
): SelectedRowTagOption[] {
	const selectedPaths = new Set(selectedRowPaths);
	const counts = new Map<string, { tag: string; count: number }>();

	for (const row of rows) {
		if (!selectedPaths.has(row.note_path)) continue;
		for (const tag of tagsCellValueForRow(row, column).value_list) {
			const trimmed = tag.trim();
			if (!trimmed) continue;
			const key = tagKey(trimmed);
			const existing = counts.get(key);
			if (existing) {
				existing.count += 1;
				continue;
			}
			counts.set(key, { tag: trimmed, count: 1 });
		}
	}

	return [...counts.values()].sort(
		(left, right) =>
			right.count - left.count ||
			left.tag.localeCompare(right.tag, undefined, { sensitivity: "base" }),
	);
}
