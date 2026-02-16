import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
import { createEditorExtensions } from "./index";

describe("Table markdown integration", () => {
	it("parses and serializes markdown tables", () => {
		const manager = new MarkdownManager({
			extensions: createEditorExtensions({
				enableSlashCommand: false,
				enableWikiLinks: false,
			}),
			markedOptions: {
				gfm: true,
				breaks: false,
			},
		});

		const input = [
			"| Name | Role |",
			"| --- | --- |",
			"| Ada | Engineer |",
			"| Lin | Designer |",
		].join("\n");

		const json = manager.parse(input);
		expect(json.content?.[0]?.type).toBe("table");

		const output = manager.serialize(json);
		expect(output).toContain("| Name");
		expect(output).toContain("| Ada");
		expect(output).toContain("| Lin");
	});
});
