import { describe, expect, it } from "vitest";
import { SETTINGS_SEARCH_ENTRIES } from "../settings/settingsSearch";
import {
	buildSearchQuery,
	movePaletteSelection,
	parsePaletteQuery,
	parseSearchQuery,
	rankPaletteResult,
	stepPaletteOption,
} from "./commandPaletteHelpers";
import { PALETTE_GROUP_ORDER, type PaletteResult } from "./paletteResults";
import { PALETTE_SETTINGS_REGISTRY } from "./settingsPaletteRegistry";

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

	it.each([
		["> open note", "commands", "open note"],
		["#project", "tags", "project"],
		["@alice", "people", "alice"],
		["settings: theme", "settings", "theme"],
		["folder: projects", "folders", "projects"],
		["template: meeting", "templates", "meeting"],
	] as const)("parses the universal prefix in %s", (raw, scope, text) => {
		expect(parsePaletteQuery(raw)).toMatchObject({ scope, text });
	});

	it("ranks exact titles ahead of keyword and description matches", () => {
		const result = (
			id: string,
			label: string,
			keywords: readonly string[],
			description = "",
		): PaletteResult => ({
			id,
			kind: "setting",
			label,
			keywords,
			description,
			category: "Settings",
			enabled: true,
		});
		const query = parsePaletteQuery("theme");
		const exact = rankPaletteResult(result("exact", "Theme", []), query);
		const keyword = rankPaletteResult(
			result("keyword", "Appearance", ["theme"]),
			query,
		);
		const description = rankPaletteResult(
			result("description", "Colors", [], "Choose a theme"),
			query,
		);
		expect(exact).toBeGreaterThan(keyword ?? 0);
		expect(keyword).toBeGreaterThan(description ?? 0);
	});

	it("keeps the documented group order", () => {
		expect(PALETTE_GROUP_ORDER).toEqual([
			"command",
			"setting",
			"open-tab",
			"note",
			"content",
			"folder",
			"tag",
			"person",
			"database",
			"template",
		]);
	});

	it("classifies every searchable setting exactly once", () => {
		const registryIds = PALETTE_SETTINGS_REGISTRY.map(({ id }) => id);
		expect(new Set(registryIds).size).toBe(registryIds.length);
		expect(new Set(registryIds)).toEqual(
			new Set(SETTINGS_SEARCH_ENTRIES.map(({ id }) => id)),
		);
	});

	it("wraps keyboard selection and skips unavailable results", () => {
		const results: PaletteResult[] = [
			{
				id: "first",
				kind: "command",
				label: "First",
				category: "Commands",
				keywords: [],
				enabled: true,
			},
			{
				id: "disabled",
				kind: "setting",
				label: "Unavailable",
				category: "Settings",
				keywords: [],
				enabled: false,
			},
			{
				id: "last",
				kind: "command",
				label: "Last",
				category: "Commands",
				keywords: [],
				enabled: true,
			},
		];

		expect(movePaletteSelection(results, "first", -1)).toBe("last");
		expect(movePaletteSelection(results, "last", 1)).toBe("first");
		expect(movePaletteSelection(results, "first", 1)).toBe("last");
	});

	it("cycles choice settings inline in both directions", () => {
		const options = [
			{ value: "system", label: "System" },
			{ value: "light", label: "Light" },
			{ value: "dark", label: "Dark" },
		];

		expect(stepPaletteOption(options, "system", 1)).toBe("light");
		expect(stepPaletteOption(options, "system", -1)).toBe("dark");
		expect(stepPaletteOption(options, "dark", 1)).toBe("system");
	});
});
