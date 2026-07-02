import { describe, expect, it } from "vitest";
import {
	DEFAULT_ATTACHMENT_FOLDER,
	modeRequiresAttachmentFolder,
	modesUseDifferentFolderSemantics,
	resolveAttachmentTargetDir,
} from "./attachmentStorage";

describe("resolveAttachmentTargetDir", () => {
	it("resolves each attachment storage mode", () => {
		expect(
			resolveAttachmentTargetDir("space-root", "assets", "notes/test.md"),
		).toBe("");
		expect(
			resolveAttachmentTargetDir(
				"specific-folder",
				"assets/uploads",
				"notes/test.md",
			),
		).toBe("assets/uploads");
		expect(
			resolveAttachmentTargetDir("note-folder", "assets", "notes/test.md"),
		).toBe("notes");
		expect(
			resolveAttachmentTargetDir(
				"note-subfolder",
				"attachments",
				"notes/test.md",
			),
		).toBe("notes/attachments");
	});

	it("saves root-level notes into the configured subfolder at the space root", () => {
		expect(
			resolveAttachmentTargetDir("note-subfolder", "attachments", "Plan.md"),
		).toBe("attachments");
	});

	it("falls back to the default attachment folder", () => {
		expect(
			resolveAttachmentTargetDir("specific-folder", null, "notes/test.md"),
		).toBe(DEFAULT_ATTACHMENT_FOLDER);
		expect(
			resolveAttachmentTargetDir("note-subfolder", "  ", "notes/test.md"),
		).toBe(`notes/${DEFAULT_ATTACHMENT_FOLDER}`);
	});

	it("falls back to the default attachment folder for invalid persisted values", () => {
		expect(
			resolveAttachmentTargetDir(
				"note-subfolder",
				"../secret",
				"notes/test.md",
			),
		).toBe(`notes/${DEFAULT_ATTACHMENT_FOLDER}`);
		expect(
			resolveAttachmentTargetDir(
				"specific-folder",
				"../secret",
				"notes/test.md",
			),
		).toBe(DEFAULT_ATTACHMENT_FOLDER);
	});
});

describe("attachment mode helpers", () => {
	it("detects folder semantics changes between browse and subfolder modes", () => {
		expect(
			modesUseDifferentFolderSemantics("specific-folder", "note-subfolder"),
		).toBe(true);
		expect(
			modesUseDifferentFolderSemantics("note-subfolder", "specific-folder"),
		).toBe(true);
		expect(
			modesUseDifferentFolderSemantics("note-folder", "note-subfolder"),
		).toBe(false);
	});

	it("identifies modes that require a configured folder", () => {
		expect(modeRequiresAttachmentFolder("specific-folder")).toBe(true);
		expect(modeRequiresAttachmentFolder("note-subfolder")).toBe(true);
		expect(modeRequiresAttachmentFolder("note-folder")).toBe(false);
	});
});
