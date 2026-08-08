import { describe, expect, it } from "vitest";
import { buildNoteDeeplink, isGlyphDeeplink } from "./deeplink";

describe("buildNoteDeeplink", () => {
	it("builds a canonical open/note URL with encoded query values", () => {
		const url = buildNoteDeeplink("/Users/me/My Vault", "notes/hello world.md");
		expect(url.startsWith("glyph://open/note?")).toBe(true);
		expect(url).toContain("space=");
		expect(url).toContain("path=");
		expect(url).toContain("hello%20world.md");
		expect(url).toContain("My%20Vault");
	});

	it("normalizes leading slashes and backslashes in the note path", () => {
		const url = buildNoteDeeplink("/space", "\\notes\\a.md");
		expect(url).toContain("path=notes/a.md");
	});

	it("rejects empty space or path", () => {
		expect(() => buildNoteDeeplink("", "a.md")).toThrow(/space/i);
		expect(() => buildNoteDeeplink("/space", "")).toThrow(/path/i);
	});
});

describe("isGlyphDeeplink", () => {
	it("detects glyph scheme case-insensitively", () => {
		expect(isGlyphDeeplink("glyph://open/note?space=/x&path=a.md")).toBe(true);
		expect(isGlyphDeeplink("GLYPH://search?space=/x&q=hi")).toBe(true);
		expect(isGlyphDeeplink("https://example.com")).toBe(false);
		expect(isGlyphDeeplink("file:///tmp/a.md")).toBe(false);
	});
});
