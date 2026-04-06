import { describe, expect, it } from "vitest";
import { buildPeopleRows, buildTagTreeRows } from "./TagsPane";

describe("TagsPane helpers", () => {
	it("builds sorted tag rows without people namespace assumptions", () => {
		expect(
			buildTagTreeRows([
				{
					tag: "work/today",
					direct_count: 1,
					total_count: 1,
					depth: 1,
					is_explicit: true,
				},
				{
					tag: "work",
					direct_count: 1,
					total_count: 2,
					depth: 0,
					is_explicit: true,
				},
			]),
		).toEqual([
			{
				tag: "work",
				label: "work",
				totalCount: 2,
				depth: 0,
				isExplicit: true,
			},
			{
				tag: "work/today",
				label: "today",
				totalCount: 1,
				depth: 1,
				isExplicit: true,
			},
		]);
	});

	it("builds sorted people rows", () => {
		expect(
			buildPeopleRows([
				{ handle: "zoe", count: 1 },
				{ handle: "alice", count: 3 },
			]),
		).toEqual([
			{ handle: "alice", count: 3 },
			{ handle: "zoe", count: 1 },
		]);
	});
});
