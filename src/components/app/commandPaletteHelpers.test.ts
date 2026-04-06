import { describe, expect, it } from "vitest";
import { buildSearchQuery, parseSearchQuery } from "./commandPaletteHelpers";

describe("commandPaletteHelpers", () => {
	it("parses people and tags from a mixed query", () => {
		expect(parseSearchQuery("@alice #project roadmap")).toEqual({
			request: {
				tags: ["#project"],
				people: ["@alice"],
				title_only: false,
				tag_only: false,
				query: "roadmap",
			},
			text: "roadmap",
		});
	});

	it("builds people and tag tokens back into a query", () => {
		expect(
			buildSearchQuery({
				tags: ["project"],
				people: ["alice"],
				title_only: false,
				tag_only: false,
				query: "roadmap",
			}),
		).toBe("#project @alice roadmap");
	});
});
