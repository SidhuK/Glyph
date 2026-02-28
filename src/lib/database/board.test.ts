import { describe, expect, it } from "vitest";
import {
	DATABASE_BOARD_EMPTY_LANE_ID,
	boardDropValue,
	boardLaneIdForRow,
	boardLaneIdsForRow,
	boardLaneValue,
	boardRowHasLane,
	createBoardLanes,
	defaultBoardGroupColumnId,
	getBoardGroupColumns,
} from "./board";
import type { DatabaseColumn, DatabaseRow } from "./types";

const statusColumn: DatabaseColumn = {
	id: "property:status",
	type: "property",
	label: "Status",
	visible: true,
	property_key: "status",
	property_kind: "text",
};

const checkboxColumn: DatabaseColumn = {
	id: "property:done",
	type: "property",
	label: "Done",
	visible: true,
	property_key: "done",
	property_kind: "checkbox",
};

const priorityColumn: DatabaseColumn = {
	id: "property:project_priority",
	type: "property",
	label: "Project priority",
	visible: true,
	property_key: "project_priority",
	property_kind: "list",
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
				kind: "text",
				value_text: "Backlog",
				value_list: [],
			},
			project_priority: {
				kind: "list",
				value_list: ["Medium Priority", "Client Work"],
			},
		},
	},
	{
		note_path: "Projects/Two.md",
		title: "Two",
		created: "2024-01-01T00:00:00Z",
		updated: "2024-01-02T00:00:00Z",
		preview: "Doing note preview",
		tags: ["#swift", "#ios"],
		properties: {
			status: {
				kind: "text",
				value_text: "Doing",
				value_list: [],
			},
			done: {
				kind: "checkbox",
				value_bool: true,
				value_list: [],
			},
			project_priority: {
				kind: "list",
				value_list: ["Medium Priority"],
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
				priorityColumn,
				tagsColumn,
			]).map((column) => column.id),
		).toEqual([
			"property:status",
			"property:done",
			"property:project_priority",
			"tags",
		]);
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
			"Backlog",
			"Doing",
			"No value",
		]);
		expect(lanes[0]?.rows[0]?.title).toBe("One");
		expect(lanes[2]?.id).toBe(DATABASE_BOARD_EMPTY_LANE_ID);
	});

	it("creates multiple lanes from list and tag values", () => {
		const priorityLanes = createBoardLanes(rows, priorityColumn);
		expect(priorityLanes.map((lane) => lane.label)).toEqual([
			"Medium Priority",
			"Client Work",
			"No value",
		]);
		expect(priorityLanes[0]?.cardCount).toBe(2);
		expect(priorityLanes[1]?.cardCount).toBe(1);

		const tagLanes = createBoardLanes(rows, tagsColumn);
		expect(tagLanes.map((lane) => lane.label)).toEqual([
			"#swift",
			"#ios",
			"No value",
		]);
		expect(boardLaneIdsForRow(secondRow, tagsColumn)).toEqual([
			"#swift",
			"#ios",
		]);
		expect(boardLaneIdForRow(secondRow, tagsColumn)).toBe("#swift");
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

	it("creates update payloads for the target lane", () => {
		expect(boardLaneValue(statusColumn, "Review")).toEqual({
			kind: "text",
			value_text: "Review",
			value_bool: null,
			value_list: [],
		});
		expect(boardLaneValue(checkboxColumn, "true")).toEqual({
			kind: "checkbox",
			value_bool: true,
			value_list: [],
		});
		expect(boardDropValue(firstRow, priorityColumn, "Urgent")).toEqual({
			kind: "list",
			value_list: ["Medium Priority", "Client Work", "Urgent"],
		});
		expect(
			boardDropValue(secondRow, tagsColumn, DATABASE_BOARD_EMPTY_LANE_ID),
		).toEqual({
			kind: "tags",
			value_list: [],
		});
	});

	it("adds missing values and preserves existing multi-value memberships", () => {
		expect(boardRowHasLane(firstRow, priorityColumn, "Client Work")).toBe(true);
		expect(boardRowHasLane(firstRow, priorityColumn, "Urgent")).toBe(false);
		expect(boardDropValue(thirdRow, statusColumn, "In Progress")).toEqual({
			kind: "text",
			value_text: "In Progress",
			value_bool: null,
			value_list: [],
		});
		expect(boardDropValue(thirdRow, tagsColumn, "#project")).toEqual({
			kind: "tags",
			value_list: ["#project"],
		});
		expect(boardDropValue(secondRow, tagsColumn, "#project")).toEqual({
			kind: "tags",
			value_list: ["#swift", "#ios", "#project"],
		});
	});
});
