import { describe, expect, it } from "vitest";
import { glyphDeepLinkForFile, parseGlyphDeepLink } from "./deeplinks";

describe("parseGlyphDeepLink", () => {
	it("parses workspace targets", () => {
		expect(parseGlyphDeepLink("glyph://note/notes/Today.md")).toEqual({
			kind: "note",
			path: "notes/Today.md",
		});
		expect(parseGlyphDeepLink("glyph://file/assets/cover.png")).toEqual({
			kind: "file",
			path: "assets/cover.png",
		});
		expect(parseGlyphDeepLink("glyph://daily-note")).toEqual({
			kind: "daily-note",
		});
	});

	it("parses app surface targets", () => {
		expect(parseGlyphDeepLink("glyph://all-docs")).toEqual({
			kind: "all-docs",
		});
		expect(parseGlyphDeepLink("glyph://calendar")).toEqual({
			kind: "calendar",
		});
		expect(parseGlyphDeepLink("glyph://databases")).toEqual({
			kind: "databases",
			databaseId: null,
		});
		expect(parseGlyphDeepLink("glyph://database/db_123")).toEqual({
			kind: "databases",
			databaseId: "db_123",
		});
	});

	it("parses settings targets", () => {
		expect(parseGlyphDeepLink("glyph://settings")).toEqual({
			kind: "settings",
			tab: "general",
		});
		expect(parseGlyphDeepLink("glyph://settings/ai")).toEqual({
			kind: "settings",
			tab: "ai",
		});
	});

	it("rejects invalid links", () => {
		expect(parseGlyphDeepLink("https://glyph.local/note/a.md")).toBeNull();
		expect(parseGlyphDeepLink("glyph://unknown/a.md")).toBeNull();
		expect(parseGlyphDeepLink("glyph://settings/nope")).toBeNull();
		expect(parseGlyphDeepLink("glyph://note/assets/cover.png")).toBeNull();
		expect(parseGlyphDeepLink("glyph://file/../secret.md")).toBeNull();
		expect(parseGlyphDeepLink("glyph://file/%2Fsecret.md")).toBeNull();
		expect(parseGlyphDeepLink("glyph://file/C:/secret.md")).toBeNull();
		expect(parseGlyphDeepLink("glyph://database/db/extra")).toBeNull();
	});

	it("decodes encoded relative paths", () => {
		expect(parseGlyphDeepLink("glyph://note/Meeting%20Notes.md")).toEqual({
			kind: "note",
			path: "Meeting Notes.md",
		});
	});

	it("builds file deeplinks", () => {
		expect(glyphDeepLinkForFile("Meeting Notes.md")).toBe(
			"glyph://note/Meeting%20Notes.md",
		);
		expect(glyphDeepLinkForFile("assets/cover image.png")).toBe(
			"glyph://file/assets/cover%20image.png",
		);
		expect(glyphDeepLinkForFile("")).toBeNull();
	});
});
