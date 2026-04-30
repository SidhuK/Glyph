import { statusLabel, statusOptionFromValue } from "../statusProperties";
import { databaseCellValueFromRow } from "./config";
import type { DatabaseCellValue, DatabaseColumn, DatabaseRow } from "./types";

export const DATABASE_BOARD_EMPTY_LANE_ID = "__empty__";

export interface DatabaseBoardLane {
	id: string;
	label: string;
	cardCount: number;
	rows: DatabaseRow[];
}

export interface DatabaseRowGroup {
	id: string;
	label: string;
	rowCount: number;
	rows: DatabaseRow[];
}

function isMultiValueBoardColumn(column: DatabaseColumn): boolean {
	return column.type === "tags" || column.property_kind === "tags";
}

function isBoardGroupColumn(column: DatabaseColumn): boolean {
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

function compareBoardRows(left: DatabaseRow, right: DatabaseRow): number {
	const leftUpdated = Date.parse(left.updated);
	const rightUpdated = Date.parse(right.updated);
	if (!Number.isNaN(leftUpdated) && !Number.isNaN(rightUpdated)) {
		if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;
	} else if (!Number.isNaN(leftUpdated)) {
		return -1;
	} else if (!Number.isNaN(rightUpdated)) {
		return 1;
	}
	return left.note_path.localeCompare(right.note_path, undefined, {
		numeric: true,
		sensitivity: "base",
	});
}

function sortLaneRows(rows: DatabaseRow[]): DatabaseRow[] {
	return [...rows].sort(compareBoardRows);
}

function uniqueLaneValues(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeBoardTagValue(value: string): string | null {
	const normalized = value
		.trim()
		.replace(/^#+/, "")
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9_/-]/g, "");
	return normalized || null;
}

function rawLaneValues(row: DatabaseRow, column: DatabaseColumn): string[] {
	const cell = databaseCellValueFromRow(row, column);
	if (isMultiValueBoardColumn(column)) {
		if (column.type === "tags" || column.property_kind === "tags") {
			return uniqueLaneValues(
				cell.value_list.map(
					(value) => normalizeBoardTagValue(value) ?? value.trim(),
				),
			);
		}
		return uniqueLaneValues(cell.value_list);
	}
	if (cell.kind === "checkbox") {
		if (typeof cell.value_bool !== "boolean") return [];
		return [cell.value_bool ? "true" : "false"];
	}
	const value = cell.value_text?.trim() ?? "";
	if (column.property_kind === "status") {
		const option = statusOptionFromValue(value);
		return option ? [option.label] : value ? [value] : [];
	}
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
				rows: sortLaneRows(buckets.get("false") ?? []),
			},
			{
				id: "true",
				label: checkboxLaneLabel(true),
				cardCount: buckets.get("true")?.length ?? 0,
				rows: sortLaneRows(buckets.get("true") ?? []),
			},
			{
				id: DATABASE_BOARD_EMPTY_LANE_ID,
				label: checkboxLaneLabel(null),
				cardCount: buckets.get(DATABASE_BOARD_EMPTY_LANE_ID)?.length ?? 0,
				rows: sortLaneRows(buckets.get(DATABASE_BOARD_EMPTY_LANE_ID) ?? []),
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

	const orderedLanes = [...lanes.values()].map((lane) => ({
		...lane,
		rows: sortLaneRows(lane.rows),
	}));
	return [
		...orderedLanes.filter((lane) => lane.id !== DATABASE_BOARD_EMPTY_LANE_ID),
		...orderedLanes.filter((lane) => lane.id === DATABASE_BOARD_EMPTY_LANE_ID),
	];
}

function groupLabel(column: DatabaseColumn, laneId: string): string {
	if (laneId === DATABASE_BOARD_EMPTY_LANE_ID) return "No value";
	if (column.property_kind === "checkbox") {
		return checkboxLaneLabel(laneId === "true");
	}
	return laneId;
}

export function createDatabaseRowGroups(
	rows: DatabaseRow[],
	column: DatabaseColumn | null,
	ascending = true,
): DatabaseRowGroup[] {
	if (!column) return [];

	const groups = new Map<string, DatabaseRowGroup>();
	for (const row of rows) {
		const laneId = boardLaneIdForRow(row, column);
		const existing = groups.get(laneId);
		if (existing) {
			existing.rows.push(row);
			existing.rowCount += 1;
			continue;
		}
		groups.set(laneId, {
			id: laneId,
			label: groupLabel(column, laneId),
			rowCount: 1,
			rows: [row],
		});
	}

	const filledGroups = [...groups.values()].filter(
		(group) => group.id !== DATABASE_BOARD_EMPTY_LANE_ID,
	);
	const emptyGroup = groups.get(DATABASE_BOARD_EMPTY_LANE_ID);
	filledGroups.sort((left, right) =>
		left.label.localeCompare(right.label, undefined, {
			numeric: true,
			sensitivity: "base",
		}),
	);
	if (!ascending) filledGroups.reverse();
	return emptyGroup ? [...filledGroups, emptyGroup] : filledGroups;
}

export function orderBoardLanes(
	lanes: DatabaseBoardLane[],
	previousLaneIds: string[],
): DatabaseBoardLane[] {
	if (lanes.length === 0) return [];
	const laneMap = new Map(lanes.map((lane) => [lane.id, lane]));
	const nextLaneIds = [
		...previousLaneIds.filter(
			(laneId) =>
				laneId !== DATABASE_BOARD_EMPTY_LANE_ID && laneMap.has(laneId),
		),
		...lanes
			.map((lane) => lane.id)
			.filter(
				(laneId) =>
					laneId !== DATABASE_BOARD_EMPTY_LANE_ID &&
					!previousLaneIds.includes(laneId),
			),
	];
	if (laneMap.has(DATABASE_BOARD_EMPTY_LANE_ID)) {
		nextLaneIds.push(DATABASE_BOARD_EMPTY_LANE_ID);
	}
	return nextLaneIds
		.map((laneId) => laneMap.get(laneId))
		.filter((lane): lane is DatabaseBoardLane => lane != null);
}

export function moveBoardLaneToIndex(
	laneIds: string[],
	sourceLaneId: string,
	targetIndex: number,
): string[] {
	const normalizedLaneIds = laneIds.filter(
		(laneId) => laneId !== DATABASE_BOARD_EMPTY_LANE_ID,
	);
	const sourceIndex = normalizedLaneIds.indexOf(sourceLaneId);
	if (sourceIndex === -1) return normalizedLaneIds;
	const boundedTargetIndex = Math.max(
		0,
		Math.min(targetIndex, normalizedLaneIds.length - 1),
	);
	if (sourceIndex === boundedTargetIndex) return normalizedLaneIds;
	const nextLaneIds = [...normalizedLaneIds];
	const [movedLaneId] = nextLaneIds.splice(sourceIndex, 1);
	if (!movedLaneId) return normalizedLaneIds;
	nextLaneIds.splice(boundedTargetIndex, 0, movedLaneId);
	return nextLaneIds;
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
		value_text:
			laneId === DATABASE_BOARD_EMPTY_LANE_ID
				? ""
				: column.property_kind === "status"
					? statusLabel(laneId)
					: laneId,
		value_bool: null,
		value_list: [],
	};
}

export function boardDropValue(
	row: DatabaseRow,
	column: DatabaseColumn,
	laneId: string,
	_sourceLaneId?: string | null,
): DatabaseCellValue {
	if (isMultiValueBoardColumn(column)) {
		const cell = databaseCellValueFromRow(row, column);
		if (laneId === DATABASE_BOARD_EMPTY_LANE_ID) {
			return {
				kind: cell.kind,
				value_list: [],
			};
		}
		if (column.type === "tags" || column.property_kind === "tags") {
			const normalizedLaneId = normalizeBoardTagValue(laneId) ?? laneId;
			return {
				kind: cell.kind,
				value_list: uniqueLaneValues([
					...cell.value_list.map(
						(value) => normalizeBoardTagValue(value) ?? value.trim(),
					),
					normalizedLaneId,
				]),
			};
		}
		return {
			kind: cell.kind,
			value_list: uniqueLaneValues([...cell.value_list, laneId]),
		};
	}

	return boardLaneValue(column, laneId);
}
