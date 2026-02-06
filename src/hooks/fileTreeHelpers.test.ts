import { describe, expect, it } from "vitest";
import type { FsEntry } from "../lib/tauri";
import {
	compareEntries,
	fileTitleFromRelPath,
	normalizeEntries,
	normalizeEntry,
	normalizeRelPath,
	shouldRefreshActiveFolderView,
	withInsertedEntry,
} from "./fileTreeHelpers";

function mkEntry(partial: Partial<FsEntry>): FsEntry {
	return {
		name: partial.name ?? "",
		rel_path: partial.rel_path ?? "",
		kind: partial.kind ?? "file",
		is_markdown: partial.is_markdown ?? false,
	};
}

describe("fileTreeHelpers", () => {
	it("normalizes rel paths and strips surrounding slashes", () => {
		expect(normalizeRelPath("\\foo\\bar\\baz.md")).toBe("foo/bar/baz.md");
		expect(normalizeRelPath(" /foo/bar/ ")).toBe("foo/bar");
	});

	it("derives markdown title from rel path", () => {
		expect(fileTitleFromRelPath("notes/Plan.md")).toBe("Plan");
		expect(fileTitleFromRelPath("notes/README.MD")).toBe("README");
		expect(fileTitleFromRelPath("notes/config.json")).toBe("config.json");
	});

	it("normalizes entries and applies fallback names", () => {
		const file = normalizeEntry(
			mkEntry({
				name: " \u200b ",
				rel_path: "/notes/New Doc.md/",
				kind: "file",
				is_markdown: true,
			}),
		);
		expect(file).toEqual(
			expect.objectContaining({
				name: "New Doc.md",
				rel_path: "notes/New Doc.md",
			}),
		);

		const dir = normalizeEntry(
			mkEntry({
				name: " ",
				rel_path: "projects/",
				kind: "dir",
			}),
		);
		expect(dir).toEqual(
			expect.objectContaining({
				name: "projects",
				rel_path: "projects",
			}),
		);
	});

	it("dedupes and sorts normalized entries", () => {
		const entries = normalizeEntries([
			mkEntry({
				name: "b.md",
				rel_path: "b.md",
				kind: "file",
				is_markdown: true,
			}),
			mkEntry({ name: "A", rel_path: "A", kind: "dir" }),
			mkEntry({
				name: "dup",
				rel_path: "b.md",
				kind: "file",
				is_markdown: true,
			}),
		]);
		expect(entries).toHaveLength(2);
		expect(entries[0]?.kind).toBe("dir");
		expect(entries[0]?.name).toBe("A");
		expect(entries[1]?.rel_path).toBe("b.md");
	});

	it("inserts only when missing and preserves sort", () => {
		const base = [
			mkEntry({ name: "Zeta", rel_path: "Zeta", kind: "dir" }),
			mkEntry({
				name: "b.md",
				rel_path: "b.md",
				kind: "file",
				is_markdown: true,
			}),
		].sort(compareEntries);
		const next = withInsertedEntry(
			base,
			mkEntry({
				name: "a.md",
				rel_path: "a.md",
				kind: "file",
				is_markdown: true,
			}),
		);
		expect(next.map((e) => e.rel_path)).toEqual(["Zeta", "a.md", "b.md"]);
		const duplicate = withInsertedEntry(
			next,
			mkEntry({
				name: "dupe",
				rel_path: "a.md",
				kind: "file",
				is_markdown: true,
			}),
		);
		expect(duplicate).toHaveLength(next.length);
	});

	it("refreshes active folder view only for matching folder", () => {
		expect(shouldRefreshActiveFolderView("", "")).toBe(true);
		expect(shouldRefreshActiveFolderView("projects", "projects")).toBe(true);
		expect(shouldRefreshActiveFolderView("projects", "notes")).toBe(false);
		expect(shouldRefreshActiveFolderView(null, "projects")).toBe(false);
	});
});
