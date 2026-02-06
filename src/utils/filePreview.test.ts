import { describe, expect, it } from "vitest";
import { getInAppPreviewKind, isInAppPreviewable } from "./filePreview";

describe("filePreview", () => {
	it("recognizes supported image extensions", () => {
		expect(getInAppPreviewKind("assets/a.png")).toBe("image");
		expect(getInAppPreviewKind("assets/a.jpg")).toBe("image");
		expect(getInAppPreviewKind("assets/a.jpeg")).toBe("image");
		expect(getInAppPreviewKind("assets/a.webp")).toBe("image");
	});

	it("recognizes pdf and txt", () => {
		expect(getInAppPreviewKind("docs/readme.pdf")).toBe("pdf");
		expect(getInAppPreviewKind("docs/readme.txt")).toBe("text");
	});

	it("is case-insensitive for extension checks", () => {
		expect(getInAppPreviewKind("a/IMAGE.JPG")).toBe("image");
		expect(getInAppPreviewKind("a/FILE.PDF")).toBe("pdf");
		expect(getInAppPreviewKind("a/NOTES.TXT")).toBe("text");
	});

	it("returns null/false for unsupported extensions", () => {
		expect(getInAppPreviewKind("notes/plan.md")).toBeNull();
		expect(getInAppPreviewKind("notes/data.json")).toBeNull();
		expect(isInAppPreviewable("notes/data.json")).toBe(false);
	});
});
