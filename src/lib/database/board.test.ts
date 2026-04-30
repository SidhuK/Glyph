import { describe, expect, it } from "vitest";
import {
	DATABASE_BOARD_EMPTY_LANE_ID,
	boardDropValue,
	boardLaneIdForRow,
	boardLaneIdsForRow,
	boardLaneValue,
	boardRowHasLane,
	createBoardLanes,
	createDatabaseRowGroups,
	defaultBoardGroupColumnId,
	getBoardGroupColumns,
	moveBoardLaneToIndex,
	orderBoardLanes,
} from "./board";
import type { DatabaseColumn, DatabaseRow } from "./types";

const statusColumn: DatabaseColumn = {
	id: "property:status",
	type: "property",
	label: "Status",
	visible: true,
	property_key: "status",
	property_kind: "status",
};

const checkboxColumn: DatabaseColumn = {
	id: "property:done",
	type: "property",
	label: "Done",
	visible: true,
	property_key: "done",
	property_kind: "checkbox",
};

const tagsColumn: DatabaseColumn = {
	id: "tags",
	type: "tags",
	label: "Tags",
	visible: true,
};

const rows: DatabaseRow[] = [
	{
		note_path: "Projects/One.md",
		title: "One",
		created: "2024-01-01T00:00:00Z",
		updated: "2024-01-02T00:00:00Z",
		preview: "Backlog note preview",
		tags: [],
		properties: {
			status: {
				kind: "status",
				value_text: "Backlog",
				value_list: [],
			},
		},
	},
	{
		note_path: "Projects/Two.md",
		title: "Two",
		created: "2024-01-01T00:00:00Z",
		updated: "2024-01-03T00:00:00Z",
		preview: "Doing note preview",
		tags: ["#swift", "#ios"],
		properties: {
			status: {
				kind: "status",
				value_text: "Doing",
				value_list: [],
			},
			done: {
				kind: "checkbox",
				value_bool: true,
				value_list: [],
			},
		},
	},
	{
		note_path: "Projects/Three.md",
		title: "Three",
		created: "2024-01-01T00:00:00Z",
		updated: "2024-01-02T00:00:00Z",
		preview: "",
		tags: [],
		properties: {},
	},
];

const firstRow = rows[0];
const secondRow = rows[1];
const thirdRow = rows[2];

if (!firstRow || !secondRow || !thirdRow) {
	throw new Error("test rows are missing");
}

describe("database board helpers", () => {
	it("finds compatible board grouping columns", () => {
		expect(
			getBoardGroupColumns([
				{ id: "title", type: "title", label: "Title", visible: true },
				statusColumn,
				checkboxColumn,
				tagsColumn,
			]).map((column) => column.id),
		).toEqual(["property:status", "property:done", "tags"]);
		expect(
			defaultBoardGroupColumnId([
				{ id: "title", type: "title", label: "Title", visible: true },
				statusColumn,
			]),
		).toBe("property:status");
	});

	it("creates lanes from the current property values", () => {
		const lanes = createBoardLanes(rows, statusColumn);
		expect(lanes.map((lane) => lane.label)).toEqual([
			"Not started",
			"In progress",
			"No value",
		]);
		expect(lanes[0]?.rows[0]?.title).toBe("One");
		expect(lanes[2]?.id).toBe(DATABASE_BOARD_EMPTY_LANE_ID);
	});

	it("sorts cards in each lane by most recently updated first", () => {
		const lanes = createBoardLanes(
			[
				{
					...firstRow,
					note_path: "Projects/One-Older.md",
					updated: "2024-01-02T00:00:00Z",
				},
				{
					...firstRow,
					note_path: "Projects/One-Newer.md",
					updated: "2024-01-04T00:00:00Z",
				},
			],
			statusColumn,
		);

		expect(lanes[0]?.rows.map((row) => row.note_path)).toEqual([
			"Projects/One-Newer.md",
			"Projects/One-Older.md",
		]);
	});

	it("creates multiple lanes from tag values", () => {
		const tagLanes = createBoardLanes(rows, tagsColumn);
		expect(tagLanes.map((lane) => lane.label)).toEqual([
			"swift",
			"ios",
			"No value",
		]);
		expect(boardLaneIdsForRow(secondRow, tagsColumn)).toEqual(["swift", "ios"]);
		expect(boardLaneIdForRow(secondRow, tagsColumn)).toBe("swift");
	});

	it("groups rows while preserving current row order inside each group", () => {
		const groups = createDatabaseRowGroups(
			[secondRow, firstRow, thirdRow],
			statusColumn,
		);

		expect(groups.map((group) => group.label)).toEqual([
			"In progress",
			"Not started",
			"No value",
		]);
		expect(groups[1]?.rows.map((row) => row.title)).toEqual(["One"]);
		expect(groups[2]?.rows.map((row) => row.title)).toEqual(["Three"]);
	});

	it("groups multi-value rows into only their first group", () => {
		const groups = createDatabaseRowGroups([secondRow], tagsColumn);

		expect(groups.map((group) => group.id)).toEqual(["swift"]);
		expect(groups[0]?.rows.map((row) => row.title)).toEqual(["Two"]);
	});

	it("creates stable checkbox lanes including blank values", () => {
		const lanes = createBoardLanes(rows, checkboxColumn);
		expect(lanes.map((lane) => lane.label)).toEqual([
			"Unchecked",
			"Checked",
			"No value",
		]);
		expect(lanes[1]?.rows[0]?.title).toBe("Two");
	});

	it("preserves existing lane order when rows refresh", () => {
		const unordered = [
			{ id: "done", label: "Done", cardCount: 1, rows: [firstRow] },
			{ id: "backlog", label: "Backlog", cardCount: 2, rows: [secondRow] },
			{
				id: DATABASE_BOARD_EMPTY_LANE_ID,
				label: "No value",
				cardCount: 0,
				rows: [],
			},
			{ id: "review", label: "Review", cardCount: 1, rows: [thirdRow] },
		];

		expect(
			orderBoardLanes(unordered, ["backlog", "done"]).map((lane) => lane.id),
		).toEqual(["backlog", "done", "review", DATABASE_BOARD_EMPTY_LANE_ID]);
	});

	it("moves lanes to an explicit position while keeping no value pinned last", () => {
		expect(
			moveBoardLaneToIndex(
				["backlog", "doing", "review", DATABASE_BOARD_EMPTY_LANE_ID],
				"review",
				0,
			),
		).toEqual(["review", "backlog", "doing"]);

		expect(
			moveBoardLaneToIndex(
				["backlog", "doing", "review", DATABASE_BOARD_EMPTY_LANE_ID],
				"backlog",
				2,
			),
		).toEqual(["doing", "review", "backlog"]);
	});

	it("creates update payloads for the target lane", () => {
		expect(boardLaneValue(statusColumn, "Review")).toEqual({
			kind: "status",
			value_text: "In review",
			value_bool: null,
			value_list: [],
		});
		expect(boardLaneValue(checkboxColumn, "true")).toEqual({
			kind: "checkbox",
			value_bool: true,
			value_list: [],
		});
		expect(
			boardDropValue(secondRow, tagsColumn, DATABASE_BOARD_EMPTY_LANE_ID),
		).toEqual({
			kind: "tags",
			value_list: [],
		});
	});

	it("adds missing tag values and preserves existing memberships", () => {
		expect(boardDropValue(thirdRow, statusColumn, "In Progress")).toEqual({
			kind: "status",
			value_text: "In progress",
			value_bool: null,
			value_list: [],
		});
		expect(boardDropValue(thirdRow, tagsColumn, "#project")).toEqual({
			kind: "tags",
			value_list: ["project"],
		});
		expect(boardDropValue(secondRow, tagsColumn, "#project")).toEqual({
			kind: "tags",
			value_list: ["swift", "ios", "project"],
		});
		expect(boardDropValue(secondRow, tagsColumn, "#project", "#swift")).toEqual(
			{
				kind: "tags",
				value_list: ["swift", "ios", "project"],
			},
		);
		expect(boardDropValue(thirdRow, tagsColumn, "#Daily Notes")).toEqual({
			kind: "tags",
			value_list: ["daily-notes"],
		});
		expect(boardDropValue(thirdRow, tagsColumn, "日本語")).toEqual({
			kind: "tags",
			value_list: ["日本語"],
		});
	});

	it("normalizes mixed raw and normalized tag lanes on read", () => {
		const mixedTagRows: DatabaseRow[] = [
			{
				...secondRow,
				note_path: "Projects/Four.md",
				tags: ["#swift", "ios"],
			},
			{
				...thirdRow,
				note_path: "Projects/Five.md",
				tags: ["swift"],
			},
		];

		const lanes = createBoardLanes(mixedTagRows, tagsColumn);
		expect(lanes.map((lane) => lane.id)).toEqual([
			"swift",
			"ios",
			DATABASE_BOARD_EMPTY_LANE_ID,
		]);
		const mixedTagRow = mixedTagRows[0];
		expect(mixedTagRow).toBeDefined();
		expect(lanes[0]?.cardCount).toBe(2);
		if (!mixedTagRow) {
			throw new Error("Expected mixed tag row");
		}
		expect(boardRowHasLane(mixedTagRow, tagsColumn, "swift")).toBe(true);
		expect(boardRowHasLane(mixedTagRow, tagsColumn, "#swift")).toBe(false);
	});
});
