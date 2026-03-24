import { describe, expect, it } from "vitest";
import { buildTagTreeRows } from "./TagsPane";

describe("TagsPane", () => {
	it("builds stable hierarchy rows from tag summaries", () => {
		expect(
			buildTagTreeRows([
				{
					tag: "work/today",
					direct_count: 2,
					total_count: 2,
					depth: 1,
					is_explicit: true,
				},
				{
					tag: "work",
					direct_count: 0,
					total_count: 2,
					depth: 0,
					is_explicit: false,
				},
			]),
		).toEqual([
			{
				tag: "work",
				label: "work",
				totalCount: 2,
				depth: 0,
				isExplicit: false,
			},
			{
				tag: "work/today",
				label: "today",
				totalCount: 2,
				depth: 1,
				isExplicit: true,
			},
		]);
	});
});
