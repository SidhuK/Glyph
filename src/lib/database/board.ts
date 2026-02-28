import { databaseCellValueFromRow, formatDatabaseDateTime } from "./config";
import type { DatabaseCellValue, DatabaseColumn, DatabaseRow } from "./types";

export const DATABASE_BOARD_EMPTY_LANE_ID = "__empty__";

export interface DatabaseBoardLane {
	id: string;
	label: string;
	cardCount: number;
	rows: DatabaseRow[];
}

function isMultiValueBoardColumn(column: DatabaseColumn): boolean {
	return (
		column.type === "tags" ||
		column.property_kind === "tags" ||
		column.property_kind === "list"
	);
}

export function isBoardGroupColumn(column: DatabaseColumn): boolean {
	return column.type === "tags" || column.type === "property";
}

export function getBoardGroupColumns(
	columns: DatabaseColumn[],
): DatabaseColumn[] {
	return columns.filter(isBoardGroupColumn);
}

export function defaultBoardGroupColumnId(
	columns: DatabaseColumn[],
): string | null {
	return getBoardGroupColumns(columns)[0]?.id ?? null;
}

function checkboxLaneLabel(value: boolean | null): string {
	if (value == null) return "No value";
	return value ? "Checked" : "Unchecked";
}

function uniqueLaneValues(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function rawLaneValues(row: DatabaseRow, column: DatabaseColumn): string[] {
	const cell = databaseCellValueFromRow(row, column);
	if (isMultiValueBoardColumn(column)) {
		return uniqueLaneValues(cell.value_list);
	}
	if (cell.kind === "checkbox") {
		if (typeof cell.value_bool !== "boolean") return [];
		return [cell.value_bool ? "true" : "false"];
	}
	const value = cell.value_text?.trim() ?? "";
	return value ? [value] : [];
}

export function boardLaneIdsForRow(
	row: DatabaseRow,
	column: DatabaseColumn,
): string[] {
	const laneValues = rawLaneValues(row, column);
	return laneValues.length > 0 ? laneValues : [DATABASE_BOARD_EMPTY_LANE_ID];
}

export function boardRowHasLane(
	row: DatabaseRow,
	column: DatabaseColumn,
	laneId: string,
): boolean {
	return boardLaneIdsForRow(row, column).includes(laneId);
}

export function boardLaneIdForRow(
	row: DatabaseRow,
	column: DatabaseColumn,
): string {
	return boardLaneIdsForRow(row, column)[0] ?? DATABASE_BOARD_EMPTY_LANE_ID;
}

export function createBoardLanes(
	rows: DatabaseRow[],
	column: DatabaseColumn | null,
): DatabaseBoardLane[] {
	if (!column) return [];

	if (column.property_kind === "checkbox") {
		const buckets = new Map<string, DatabaseRow[]>([
			["false", []],
			["true", []],
			[DATABASE_BOARD_EMPTY_LANE_ID, []],
		]);
		for (const row of rows) {
			const laneId = boardLaneIdForRow(row, column);
			buckets.get(laneId)?.push(row);
		}
		return [
			{
				id: "false",
				label: checkboxLaneLabel(false),
				cardCount: buckets.get("false")?.length ?? 0,
				rows: buckets.get("false") ?? [],
			},
			{
				id: "true",
				label: checkboxLaneLabel(true),
				cardCount: buckets.get("true")?.length ?? 0,
				rows: buckets.get("true") ?? [],
			},
			{
				id: DATABASE_BOARD_EMPTY_LANE_ID,
				label: checkboxLaneLabel(null),
				cardCount: buckets.get(DATABASE_BOARD_EMPTY_LANE_ID)?.length ?? 0,
				rows: buckets.get(DATABASE_BOARD_EMPTY_LANE_ID) ?? [],
			},
		];
	}

	const lanes = new Map<string, DatabaseBoardLane>();
	for (const row of rows) {
		for (const laneId of boardLaneIdsForRow(row, column)) {
			const label =
				laneId === DATABASE_BOARD_EMPTY_LANE_ID ? "No value" : laneId;
			const existing = lanes.get(laneId);
			if (existing) {
				existing.rows.push(row);
				existing.cardCount += 1;
				continue;
			}
			lanes.set(laneId, {
				id: laneId,
				label,
				cardCount: 1,
				rows: [row],
			});
		}
	}

	if (!lanes.has(DATABASE_BOARD_EMPTY_LANE_ID)) {
		lanes.set(DATABASE_BOARD_EMPTY_LANE_ID, {
			id: DATABASE_BOARD_EMPTY_LANE_ID,
			label: "No value",
			cardCount: 0,
			rows: [],
		});
	}

	const orderedLanes = [...lanes.values()];
	return [
		...orderedLanes.filter((lane) => lane.id !== DATABASE_BOARD_EMPTY_LANE_ID),
		...orderedLanes.filter((lane) => lane.id === DATABASE_BOARD_EMPTY_LANE_ID),
	];
}

export function boardLaneValue(
	column: DatabaseColumn,
	laneId: string,
): DatabaseCellValue {
	if (column.property_kind === "checkbox") {
		return {
			kind: "checkbox",
			value_bool:
				laneId === DATABASE_BOARD_EMPTY_LANE_ID ? null : laneId === "true",
			value_list: [],
		};
	}

	return {
		kind: column.property_kind ?? "text",
		value_text: laneId === DATABASE_BOARD_EMPTY_LANE_ID ? "" : laneId,
		value_bool: null,
		value_list: [],
	};
}

export function boardDropValue(
	row: DatabaseRow,
	column: DatabaseColumn,
	laneId: string,
): DatabaseCellValue {
	if (isMultiValueBoardColumn(column)) {
		const cell = databaseCellValueFromRow(row, column);
		if (laneId === DATABASE_BOARD_EMPTY_LANE_ID) {
			return {
				kind: cell.kind,
				value_list: [],
			};
		}
		return {
			kind: cell.kind,
			value_list: uniqueLaneValues([...cell.value_list, laneId]),
		};
	}

	return boardLaneValue(column, laneId);
}

export function formatBoardCellValue(cell: DatabaseCellValue): string {
	if (cell.kind === "checkbox") {
		if (typeof cell.value_bool !== "boolean") return "";
		return cell.value_bool ? "Checked" : "Unchecked";
	}
	if (cell.kind === "datetime") {
		return formatDatabaseDateTime(cell.value_text);
	}
	if (cell.kind === "date") {
		return cell.value_text ?? "";
	}
	if (cell.value_list.length > 0) {
		return cell.value_list.join(", ");
	}
	return cell.value_text ?? "";
}
