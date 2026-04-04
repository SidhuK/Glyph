import { describe, expect, it } from "vitest";
import {
	clearMarkdownDocCache,
	getCachedMarkdownDoc,
	setCachedMarkdownDoc,
} from "./markdownCache";

describe("markdownCache", () => {
	it("promotes a cached document when read", () => {
		clearMarkdownDocCache();
		setCachedMarkdownDoc("a.md", "a");
		setCachedMarkdownDoc("b.md", "b");
		expect(getCachedMarkdownDoc("a.md")).toBe("a");
		for (let i = 0; i < 10; i += 1) {
			setCachedMarkdownDoc(`extra-${i}.md`, `${i}`);
		}
		setCachedMarkdownDoc("last.md", "last");
		expect(getCachedMarkdownDoc("a.md")).toBe("a");
		expect(getCachedMarkdownDoc("b.md")).toBeUndefined();
	});

	it("evicts old entries when the entry limit is exceeded", () => {
		clearMarkdownDocCache();
		for (let i = 0; i < 12; i += 1) {
			setCachedMarkdownDoc(`doc-${i}.md`, `${i}`);
		}
		expect(getCachedMarkdownDoc("doc-0.md")).toBe("0");
		setCachedMarkdownDoc("doc-12.md", "12");
		expect(getCachedMarkdownDoc("doc-1.md")).toBeUndefined();
		expect(getCachedMarkdownDoc("doc-12.md")).toBe("12");
	});

	it("evicts by total character count as well", () => {
		clearMarkdownDocCache();
		setCachedMarkdownDoc("small.md", "small");
		setCachedMarkdownDoc("big-1.md", "x".repeat(1_500_000));
		setCachedMarkdownDoc("big-2.md", "y".repeat(900_001));
		expect(getCachedMarkdownDoc("small.md")).toBeUndefined();
		expect(getCachedMarkdownDoc("big-1.md")).toBeUndefined();
		expect(getCachedMarkdownDoc("big-2.md")).toBe("y".repeat(900_001));
	});
});
