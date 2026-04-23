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

	it("keeps parent above child even when child has a higher count", () => {
		expect(
			buildTagTreeRows([
				{
					tag: "work/backend",
					direct_count: 7,
					total_count: 7,
					depth: 1,
					is_explicit: true,
				},
				{
					tag: "work",
					direct_count: 0,
					total_count: 5,
					depth: 0,
					is_explicit: false,
				},
			]),
		).toEqual([
			{
				tag: "work",
				label: "work",
				totalCount: 5,
				depth: 0,
				isExplicit: false,
			},
			{
				tag: "work/backend",
				label: "backend",
				totalCount: 7,
				depth: 1,
				isExplicit: true,
			},
		]);
	});
});
