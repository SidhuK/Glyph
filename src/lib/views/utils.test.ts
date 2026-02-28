import { describe, expect, it } from "vitest";
import { basename, sha256Hex, viewDocPath, viewId } from "./utils";

describe("views/utils", () => {
	it("builds stable view ids and selectors", () => {
		expect(viewId({ kind: "global" })).toEqual({
			id: "global",
			kind: "global",
			selector: "",
			title: "Space",
		});
		expect(viewId({ kind: "folder", dir: " /notes/work/ " })).toEqual({
			id: "folder:notes/work",
			kind: "folder",
			selector: "notes/work",
			title: "work",
		});
		expect(viewId({ kind: "tag", tag: "todo" }).title).toBe("#todo");
		expect(viewId({ kind: "search", query: "abc" }).id).toBe("search:abc");
	});

	it("computes expected SHA-256 hash", async () => {
		expect(await sha256Hex("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});

	it("builds stable view doc paths", async () => {
		expect(await viewDocPath({ kind: "global" })).toBe("views/global.json");
		const p1 = await viewDocPath({ kind: "folder", dir: "notes" });
		const p2 = await viewDocPath({ kind: "folder", dir: "notes" });
		expect(p1).toBe(p2);
		expect(p1.startsWith("views/folder/")).toBe(true);
		expect(p1.endsWith(".json")).toBe(true);
	});

	it("extracts basename", () => {
		expect(basename("a/b/c.md")).toBe("c.md");
		expect(basename("root")).toBe("root");
	});
});
