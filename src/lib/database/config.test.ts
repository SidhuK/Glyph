import { describe, expect, it } from "vitest";
import {
	createDefaultDatabaseConfig,
	createPropertyColumn,
	rowMatchesFilters,
} from "./config";
import type { DatabaseRow } from "./types";

const sampleRow: DatabaseRow = {
	note_path: "Projects/Roadmap.md",
	title: "Roadmap",
	created: "2024-01-01T00:00:00Z",
	updated: "2024-01-02T00:00:00Z",
	tags: ["#work", "#priority"],
	properties: {
		status: {
			kind: "text",
			value_text: "Active",
			value_list: [],
		},
	},
};

describe("database config helpers", () => {
	it("matches text filters against property-backed columns", () => {
		const config = createDefaultDatabaseConfig("Projects");
		config.columns.push({
			id: "property:status",
			type: "property",
			label: "Status",
			width: 180,
			visible: true,
			property_key: "status",
			property_kind: "text",
		});
		config.filters = [
			{
				column_id: "property:status",
				operator: "contains",
				value_text: "act",
				value_list: [],
			},
		];
		expect(rowMatchesFilters(sampleRow, config.columns, config.filters)).toBe(
			true,
		);
	});

	it("matches tags_contains filters against built-in tags", () => {
		const config = createDefaultDatabaseConfig("Projects");
		config.filters = [
			{
				column_id: "tags",
				operator: "tags_contains",
				value_text: "#work",
				value_list: [],
			},
		];
		expect(rowMatchesFilters(sampleRow, config.columns, config.filters)).toBe(
			true,
		);
	});

	it("matches contains filters against tag-backed columns", () => {
		const config = createDefaultDatabaseConfig("Projects");
		config.filters = [
			{
				column_id: "tags",
				operator: "contains",
				value_text: "prior",
				value_list: [],
			},
		];
		expect(rowMatchesFilters(sampleRow, config.columns, config.filters)).toBe(
			true,
		);
	});

	it("treats false checkbox values as non-empty", () => {
		const config = createDefaultDatabaseConfig("Projects");
		config.columns.push({
			id: "property:done",
			type: "property",
			label: "Done",
			width: 120,
			visible: true,
			property_key: "done",
			property_kind: "checkbox",
		});
		const row: DatabaseRow = {
			...sampleRow,
			properties: {
				...sampleRow.properties,
				done: {
					kind: "checkbox",
					value_bool: false,
					value_list: [],
				},
			},
		};
		config.filters = [
			{
				column_id: "property:done",
				operator: "is_not_empty",
				value_list: [],
			},
		];
		expect(rowMatchesFilters(row, config.columns, config.filters)).toBe(true);
	});

	it("seeds built-in column icons in the starter config", () => {
		const config = createDefaultDatabaseConfig("Projects");
		expect(config.columns.map((column) => column.icon)).toEqual([
			"document",
			"tag",
			"clock",
		]);
	});

	it("seeds persisted view defaults in the starter config", () => {
		const config = createDefaultDatabaseConfig("Projects");
		expect(config.view).toEqual({
			layout: "table",
			board_group_by: null,
		});
	});

	it("assigns default icons to property columns from their kind", () => {
		expect(
			createPropertyColumn({
				key: "status",
				kind: "checkbox",
				count: 1,
			}).icon,
		).toBe("check-circle");
	});
});
