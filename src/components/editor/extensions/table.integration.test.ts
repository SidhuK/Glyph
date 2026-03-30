// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
import { createEditorExtensions } from "./index";

function createMarkdownManager() {
	return new MarkdownManager({
		extensions: createEditorExtensions({
			enableSlashCommand: false,
			enableWikiLinks: false,
			enableMarkdownLinkAutocomplete: false,
		}),
		markedOptions: {
			gfm: true,
			breaks: false,
		},
	});
}

function createEditor(markdown: string) {
	const element = document.createElement("div");
	document.body.appendChild(element);
	const editor = new Editor({
		extensions: createEditorExtensions({
			enableSlashCommand: false,
			enableWikiLinks: false,
			enableMarkdownLinkAutocomplete: false,
		}),
		content: markdown,
		contentType: "markdown",
		element,
	});

	return {
		editor,
		destroy() {
			editor.destroy();
			element.remove();
		},
	};
}

function findFirstTableCellPos(editor: Editor) {
	let match = -1;
	editor.state.doc.descendants((node, pos) => {
		if (match !== -1) return false;
		if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") {
			return true;
		}
		match = pos;
		return false;
	});
	return match;
}

function tableShape(markdown: string) {
	const manager = createMarkdownManager();
	const json = manager.parse(markdown);
	const table = json.content?.find((node) => node.type === "table");
	const rows = table?.content ?? [];
	const columns = rows[0]?.content?.length ?? 0;
	return {
		rowCount: rows.length,
		columnCount: columns,
	};
}

describe("Table markdown integration", () => {
	it("parses and serializes markdown tables", () => {
		const manager = createMarkdownManager();

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

	it("round-trips markdown after inserting a row", () => {
		const input = [
			"| Name | Role |",
			"| --- | --- |",
			"| Ada | Engineer |",
			"| Lin | Designer |",
		].join("\n");
		const harness = createEditor(input);

		try {
			const cellPos = findFirstTableCellPos(harness.editor);
			expect(cellPos).toBeGreaterThan(-1);

			harness.editor.commands.setTextSelection(cellPos + 2);
			harness.editor.commands.addRowAfter();

			expect(tableShape(harness.editor.getMarkdown())).toEqual({
				rowCount: 4,
				columnCount: 2,
			});
		} finally {
			harness.destroy();
		}
	});

	it("round-trips markdown after inserting a column", () => {
		const input = [
			"| Name | Role |",
			"| --- | --- |",
			"| Ada | Engineer |",
			"| Lin | Designer |",
		].join("\n");
		const harness = createEditor(input);

		try {
			const cellPos = findFirstTableCellPos(harness.editor);
			expect(cellPos).toBeGreaterThan(-1);

			harness.editor.commands.setTextSelection(cellPos + 2);
			harness.editor.commands.addColumnAfter();

			expect(tableShape(harness.editor.getMarkdown())).toEqual({
				rowCount: 3,
				columnCount: 3,
			});
		} finally {
			harness.destroy();
		}
	});
});
