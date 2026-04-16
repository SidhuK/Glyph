import { databaseCellValueFromRow } from "./config";
import type { DatabaseCellValue, DatabaseColumn, DatabaseRow } from "./types";

function compareNullable<T>(
	left: T | null,
	right: T | null,
	compare: (left: T, right: T) => number,
): number {
	if (left == null && right == null) return 0;
	if (left == null) return 1;
	if (right == null) return -1;
	return compare(left, right);
}

function stringValue(cell: DatabaseCellValue): string | null {
	if (cell.value_text?.trim()) return cell.value_text;
	if (cell.value_list.length > 0) return cell.value_list.join(", ");
	if (typeof cell.value_bool === "boolean") return String(cell.value_bool);
	return null;
}

function numericValue(cell: DatabaseCellValue): number | null {
	const raw = cell.value_text?.trim();
	if (!raw) return null;
	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
}

function dateValue(cell: DatabaseCellValue): number | null {
	const raw = cell.value_text?.trim();
	if (!raw) return null;
	const value = Date.parse(raw);
	return Number.isNaN(value) ? null : value;
}

function booleanValue(cell: DatabaseCellValue): number | null {
	if (typeof cell.value_bool !== "boolean") return null;
	return cell.value_bool ? 1 : 0;
}

export function compareDatabaseRowValues(
	left: DatabaseRow,
	right: DatabaseRow,
	column: DatabaseColumn,
): number {
	const leftCell = databaseCellValueFromRow(left, column);
	const rightCell = databaseCellValueFromRow(right, column);

	if (leftCell.kind !== rightCell.kind) {
		return compareNullable(
			stringValue(leftCell),
			stringValue(rightCell),
			(a, b) =>
				a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
		);
	}

	switch (leftCell.kind) {
		case "checkbox":
			return compareNullable(
				booleanValue(leftCell),
				booleanValue(rightCell),
				(a, b) => a - b,
			);
		case "number":
			return compareNullable(
				numericValue(leftCell),
				numericValue(rightCell),
				(a, b) => a - b,
			);
		case "date":
		case "datetime":
			return compareNullable(
				dateValue(leftCell),
				dateValue(rightCell),
				(a, b) => a - b,
			);
		default:
			return compareNullable(
				stringValue(leftCell),
				stringValue(rightCell),
				(a, b) =>
					a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
			);
	}
}
