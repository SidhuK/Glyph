import { describe, expect, it } from "vitest";
import { countWords } from "./textStats";

describe("textStats", () => {
	it("counts words with collapsed whitespace", () => {
		expect(countWords("  one   two\tthree\nfour  ")).toBe(4);
	});

	it("returns zero words for empty content", () => {
		expect(countWords("   ")).toBe(0);
	});
});
