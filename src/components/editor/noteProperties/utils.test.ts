import { describe, expect, it } from "vitest";
import {
	buildTagSuggestions,
	normalizeTagDraftPrefix,
	normalizeTagToken,
} from "./utils";

const availableTags = [
	{
		tag: "work",
		direct_count: 3,
		total_count: 5,
		depth: 0,
		is_explicit: true,
	},
	{
		tag: "work/today",
		direct_count: 2,
		total_count: 2,
		depth: 1,
		is_explicit: true,
	},
	{
		tag: "work/today/further",
		direct_count: 1,
		total_count: 1,
		depth: 2,
		is_explicit: true,
	},
	{
		tag: "work/virtual",
		direct_count: 0,
		total_count: 1,
		depth: 1,
		is_explicit: false,
	},
];

describe("tag utils", () => {
	it("normalizes nested tokens and rejects invalid empty segments", () => {
		expect(normalizeTagToken("#Work/Today/Further")).toBe("work/today/further");
		expect(normalizeTagToken("#work//today")).toBeNull();
		expect(normalizeTagToken("#work/")).toBeNull();
	});

	it("keeps partial path prefixes for autocomplete", () => {
		expect(normalizeTagDraftPrefix("#Work/Today/")).toBe("work/today/");
	});

	it("prioritizes explicit descendants for prefix-aware suggestions", () => {
		expect(buildTagSuggestions(availableTags, [], "work/")).toEqual([
			{ tag: "work/today", count: 2 },
			{ tag: "work/today/further", count: 1 },
		]);
	});
});
