import { describe, expect, it } from "vitest";
import {
	databaseListFolderPath,
	databaseListTitle,
	visibleDatabaseListTags,
} from "./list";
import type { DatabaseRow } from "./types";

function row(overrides: Partial<DatabaseRow>): DatabaseRow {
	return {
		note_path: "Projects/Tasks/Note.md",
		title: "Note",
		folder: "Projects/Tasks",
		created: "2026-04-27T00:00:00Z",
		updated: "2026-04-27T00:00:00Z",
		preview: "",
		tags: [],
		linked_notes: [],
		properties: {},
		...overrides,
	};
}

describe("database list helpers", () => {
	it("formats nested folder paths with a trailing slash", () => {
		expect(databaseListFolderPath(row({}))).toBe("Projects/Tasks/");
	});

	it("falls back to the note path parent when folder is missing", () => {
		expect(
			databaseListFolderPath(row({ folder: "", note_path: "A/B/C.md" })),
		).toBe("A/B/");
	});

	it("uses root for root-level notes", () => {
		expect(
			databaseListFolderPath(row({ folder: "", note_path: "Note.md" })),
		).toBe("/");
	});

	it("falls back to the filename when the indexed title is blank", () => {
		expect(
			databaseListTitle(row({ title: " ", note_path: "Inbox/Draft.md" })),
		).toBe("Draft");
	});

	it("limits visible tags and reports overflow", () => {
		expect(visibleDatabaseListTags(["a", "b", "c", "d"])).toEqual({
			visibleTags: ["a", "b", "c"],
			extraTagCount: 1,
		});
	});
});
