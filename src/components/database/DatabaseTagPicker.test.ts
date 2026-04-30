import { describe, expect, it } from "vitest";
import {
	buildDatabaseTagPickerExplicitTags,
	buildDatabaseTagPickerOptions,
} from "./DatabaseTagPicker";

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

	it("treats leading slash queries like an empty prefix", () => {
		expect(buildDatabaseTagPickerOptions(availableTags, "/work")).toEqual([
			{ tag: "work", count: 3 },
			{ tag: "personal", count: 1 },
		]);
	});

	it("checks exact matches against the full explicit tag set", () => {
		expect(buildDatabaseTagPickerExplicitTags(availableTags)).toEqual([
			"work",
			"personal",
		]);
	});

	it("returns every explicit tag when query is empty", () => {
		const manyTags = Array.from({ length: 45 }, (_, index) => ({
			tag: `tag-${index}`,
			direct_count: 1,
			total_count: 1,
			depth: 0,
			is_explicit: true,
		}));

		const result = buildDatabaseTagPickerOptions(manyTags, "");
		const resultTags = result.map(({ tag }) => tag);

		expect(resultTags).toEqual(manyTags.map(({ tag }) => tag));
		expect(new Set(resultTags).size).toBe(45);
	});

	it("returns every matching explicit tag for typed queries", () => {
		const manyTags = Array.from({ length: 12 }, (_, index) => ({
			tag: `project-${index}`,
			direct_count: 1,
			total_count: 1,
			depth: 0,
			is_explicit: true,
		}));

		const result = buildDatabaseTagPickerOptions(manyTags, "project");
		const resultTags = result.map(({ tag }) => tag);
		const expectedTags = manyTags.map(({ tag }) => tag);

		expect(new Set(resultTags)).toEqual(new Set(expectedTags));
		expect(new Set(resultTags).size).toBe(12);
	});
});
