import { describe, expect, it } from "vitest";
import { countLines, countWords, formatReadingTime } from "./textStats";

describe("textStats", () => {
	it("counts words with collapsed whitespace", () => {
		expect(countWords("  one   two\tthree\nfour  ")).toBe(4);
	});

	it("returns zero words for empty content", () => {
		expect(countWords("   ")).toBe(0);
	});

	it("counts lines for LF and CRLF content", () => {
		expect(countLines("a\nb\nc")).toBe(3);
		expect(countLines("a\r\nb\r\nc")).toBe(3);
	});

	it("returns zero lines for empty content", () => {
		expect(countLines("")).toBe(0);
	});

	it("formats reading time in seconds and minutes", () => {
		expect(formatReadingTime(0)).toBe("0s");
		expect(formatReadingTime(50)).toBe("15s");
		expect(formatReadingTime(200)).toBe("1m");
		expect(formatReadingTime(201)).toBe("1m 1s");
	});
});
