import { describe, expect, it } from "vitest";
import { unifiedDiff } from "./diff";

describe("diff", () => {
	it("returns no changes when text is identical", () => {
		expect(unifiedDiff("a\nb", "a\nb")).toBe("No changes.");
	});

	it("shows insertions and deletions", () => {
		const out = unifiedDiff("a\nb\nc", "a\nx\nc");
		expect(out).toContain("+ x");
		expect(out).not.toBe("No changes.");
	});

	it("normalizes CRLF input before diffing", () => {
		expect(unifiedDiff("a\r\nb", "a\nb")).toBe("No changes.");
	});

	it("truncates output when maxDiffLines is exceeded", () => {
		const before = Array.from({ length: 50 }, (_, i) => `old-${i}`).join("\n");
		const after = Array.from({ length: 50 }, (_, i) => `new-${i}`).join("\n");
		expect(unifiedDiff(before, after, { maxDiffLines: 2 })).toBe(
			"Diff output truncated.",
		);
	});
});
