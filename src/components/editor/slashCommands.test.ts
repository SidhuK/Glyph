import { describe, expect, it } from "vitest";
import { clampSlashCommandIndex } from "./slashCommands";

describe("clampSlashCommandIndex", () => {
	it("wraps forward past the last item", () => {
		expect(clampSlashCommandIndex(3, 3)).toBe(0);
	});

	it("wraps backward before the first item", () => {
		expect(clampSlashCommandIndex(-1, 3)).toBe(2);
	});

	it("stays at zero when there are no items", () => {
		expect(clampSlashCommandIndex(2, 0)).toBe(0);
	});
});
