import { describe, expect, it } from "vitest";
import { buildDatabaseTagPickerOptions } from "./DatabaseTagPicker";

const availableTags = [
	{
		tag: "work",
		direct_count: 3,
		total_count: 5,
		depth: 0,
		is_explicit: true,
	},
	{
		tag: "work/virtual",
		direct_count: 0,
		total_count: 1,
		depth: 1,
		is_explicit: false,
	},
	{
		tag: "personal",
		direct_count: 1,
		total_count: 1,
		depth: 0,
		is_explicit: true,
	},
];

describe("DatabaseTagPicker", () => {
	it("excludes virtual tags when query is empty", () => {
		expect(buildDatabaseTagPickerOptions(availableTags, "")).toEqual([
			{ tag: "work", count: 3 },
			{ tag: "personal", count: 1 },
		]);
	});

	it("excludes virtual tags when a query matches them", () => {
		expect(buildDatabaseTagPickerOptions(availableTags, "virtual")).toEqual([]);
	});
});
