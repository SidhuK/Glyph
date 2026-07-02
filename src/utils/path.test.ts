import { describe, expect, it } from "vitest";
import { joinRelPath, validateRelFolderPath } from "./path";

describe("validateRelFolderPath", () => {
	it("accepts simple and nested folder paths", () => {
		expect(validateRelFolderPath("attachments")).toBeNull();
		expect(validateRelFolderPath("assets/images")).toBeNull();
	});

	it("rejects traversal and hidden segments", () => {
		expect(validateRelFolderPath("../secret")).toContain("..");
		expect(validateRelFolderPath(".hidden")).toContain("hidden");
	});

	it("rejects empty paths", () => {
		expect(validateRelFolderPath("")).toContain("empty");
		expect(validateRelFolderPath("   ")).toContain("empty");
	});

	it("rejects whitespace-only segments", () => {
		expect(validateRelFolderPath("assets/ /images")).toContain("empty");
	});
});

describe("joinRelPath", () => {
	it("joins normalized path segments", () => {
		expect(joinRelPath("notes", "attachments")).toBe("notes/attachments");
		expect(joinRelPath("", "attachments")).toBe("attachments");
		expect(joinRelPath("notes/", "/attachments/")).toBe("notes/attachments");
	});
});
