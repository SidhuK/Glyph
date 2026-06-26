// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
import {
	postprocessDetailsMarkdown,
	preprocessDetailsMarkdown,
} from "../markdown/detailsMarkdown";
import {
	postprocessMarkdownFromEditor,
	preprocessMarkdownForEditor,
} from "../markdown/wikiLinkMarkdownBridge";
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

describe("details markdown bridge", () => {
	it("round-trips open details html through preprocess and postprocess", () => {
		const input = `<details open>
<summary>Toggle title</summary>

Toggle content.

</details>`;

		expect(postprocessDetailsMarkdown(preprocessDetailsMarkdown(input))).toBe(
			input,
		);
	});

	it("round-trips closed details html", () => {
		const input = `<details>
<summary>Hidden section</summary>

Secret content.

</details>`;

		expect(postprocessDetailsMarkdown(preprocessDetailsMarkdown(input))).toBe(
			input,
		);
	});

	it("escapes angle brackets in summary text on disk", () => {
		const fences = [
			":::details {open}",
			"",
			":::detailsSummary",
			"",
			"</summary><script>",
			"",
			":::",
			"",
			":::detailsContent",
			"",
			"Body text.",
			"",
			":::",
			"",
			":::",
		].join("\n");

		expect(postprocessDetailsMarkdown(fences)).toBe(
			`<details open>
<summary>&lt;/summary&gt;&lt;script&gt;</summary>

Body text.

</details>`,
		);
	});

	it("keeps nested details html inside top-level content on round-trip", () => {
		const input = `<details open>
<summary>Outer</summary>

<details>
<summary>Inner</summary>

Nested body.

</details>

</details>`;

		const fences = preprocessDetailsMarkdown(input);
		expect(fences).toContain(":::details {open}");
		expect(fences).toContain("Outer");
		expect(fences).toContain("Inner");
		expect(fences).toContain("Nested body.");
		expect(postprocessDetailsMarkdown(fences)).toBe(input);
	});
});

describe("Details block markdown integration", () => {
	it("round-trips open details through markdown parse and serialize", () => {
		const manager = createMarkdownManager();
		const input = `<details open>
<summary>Toggle title</summary>

Toggle content.

</details>`;

		const json = manager.parse(preprocessMarkdownForEditor(input));
		const detailsNode = json.content?.[0];

		expect(detailsNode?.type).toBe("details");
		expect(detailsNode?.attrs?.open).toBe(true);

		const output = postprocessMarkdownFromEditor(manager.serialize(json));
		expect(output).toBe(input);
	});

	it("round-trips closed details through markdown parse and serialize", () => {
		const manager = createMarkdownManager();
		const input = `<details>
<summary>Collapsed</summary>

Hidden paragraph.

</details>`;

		const json = manager.parse(preprocessMarkdownForEditor(input));
		const detailsNode = json.content?.[0];

		expect(detailsNode?.type).toBe("details");
		expect(detailsNode?.attrs?.open).not.toBe(true);

		const output = postprocessMarkdownFromEditor(manager.serialize(json));
		expect(output).toBe(input);
	});

	it("preserves multi-paragraph content inside details", () => {
		const manager = createMarkdownManager();
		const input = `<details open>
<summary>Section</summary>

First paragraph.

Second paragraph.

</details>`;

		const json = manager.parse(preprocessMarkdownForEditor(input));
		const output = postprocessMarkdownFromEditor(manager.serialize(json));
		expect(output).toBe(input);
	});

	it("inserts a details block from the editor command surface", () => {
		const editor = new Editor({
			extensions: createEditorExtensions({
				enableSlashCommand: false,
				enableWikiLinks: false,
				enableMarkdownLinkAutocomplete: false,
			}),
			content: "",
			contentType: "markdown",
			element: document.createElement("div"),
		});

		editor.commands.insertContent({
			type: "details",
			attrs: { open: true },
			content: [
				{
					type: "detailsSummary",
					content: [{ type: "text", text: "Toggle title" }],
				},
				{
					type: "detailsContent",
					content: [{ type: "paragraph" }],
				},
			],
		});

		const output = postprocessMarkdownFromEditor(editor.getMarkdown());
		expect(output).toContain("<details open>");
		expect(output).toContain("<summary>Toggle title</summary>");

		editor.destroy();
	});
});
