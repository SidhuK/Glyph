// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vite-plus/test";
import {
	postprocessMarkdownFromEditor,
	preprocessMarkdownForEditor,
} from "../markdown/editorMarkdownBridge";
import { createDetailsBlockContent } from "../editorActions";
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

function roundTrip(input: string) {
	const manager = createMarkdownManager();
	return postprocessMarkdownFromEditor(
		manager.serialize(manager.parse(preprocessMarkdownForEditor(input))),
	);
}

describe("details markdown round-trip", () => {
	it("escapes angle brackets in summary text on disk", () => {
		const input = `<details open>
<summary>&lt;/summary&gt;&lt;script&gt;</summary>

Body text.

</details>`;

		expect(roundTrip(input)).toBe(input);
	});

	it("keeps content after a details block", () => {
		const input = `<details>
<summary>Title</summary>

Body text.

</details>

After paragraph.

## Heading after`;

		expect(roundTrip(input)).toBe(input);
	});

	it("keeps content between and after two details blocks", () => {
		const input = `Intro

<details open>
<summary>A</summary>

Body A

</details>

Between para.

<details>
<summary>B</summary>

Body B

</details>

Tail.`;

		expect(roundTrip(input)).toBe(input);
	});

	it.each([
		["backtick", "```js\nconst a = 1;\n```"],
		["tilde", "~~~js\nconst a = 1;\n~~~"],
		["longer", "````md\n```\ninner\n```\n````"],
		["closing tag", "```html\n</details>\n```"],
		["container syntax", "```md\n:::note\nText\n:::\n```"],
	])("keeps a %s code fence inside a details block", (_name, fence) => {
		const details = (code: string) => `<details>
<summary>Title</summary>

${code}

</details>

After.`;

		// Tilde fences are written back with backticks.
		expect(roundTrip(details(fence))).toBe(details(fence.replace(/~~~/g, "```")));
	});

	it("reads a code fence inside a details block without blank lines around it", () => {
		const manager = createMarkdownManager();
		const input =
			"<details>\n<summary>Title</summary>\n```js\nconst a = 1;\n```\n</details>\nAfter.";

		const json = manager.parse(preprocessMarkdownForEditor(input));
		expect(json.content?.map((node) => node.type)).toEqual(["details", "paragraph"]);
		expect(json.content?.[0]?.content?.[1]?.content?.[0]?.type).toBe("codeBlock");
	});

	it("keeps nested details blocks", () => {
		const input = `<details open>
<summary>Outer</summary>

<details>
<summary>Inner</summary>

Nested body.

</details>

</details>

After.`;

		expect(roundTrip(input)).toBe(input);
	});

	it("ignores details tags in inline code and stray closing tags", () => {
		const input = `Use \`<details>\` for toggles.

</details>

<details>
<summary>Title</summary>

Body.

</details>`;

		const json = createMarkdownManager().parse(preprocessMarkdownForEditor(input));
		expect(json.content?.map((node) => node.type)).toContain("details");
		expect(roundTrip(input)).toContain(
			"<details>\n<summary>Title</summary>\n\nBody.\n\n</details>",
		);
	});

	it("keeps bare ::: lines inside details content", () => {
		const input = `<details>
<summary>Title</summary>

Body

:::

More body

</details>`;

		expect(roundTrip(input)).toBe(input);
	});

	it("leaves html details examples inside markdown code fences untouched", () => {
		const input = [
			"```html",
			"<details>",
			"<summary>Example</summary>",
			"Body",
			"</details>",
			"```",
		].join("\n");

		expect(roundTrip(input)).toBe(input);
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

	it("inserts a details block via the details_block action content path", () => {
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

		const inserted = editor.chain().focus().insertContent(createDetailsBlockContent()).run();
		expect(inserted).toBe(true);

		const output = postprocessMarkdownFromEditor(editor.getMarkdown());
		expect(output).toContain("<details open>");
		expect(output).toContain("<summary>Toggle title</summary>");

		editor.destroy();
	});

	it("persists toggle changes for a details block at document start", async () => {
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

		editor.chain().focus().insertContent(createDetailsBlockContent()).run();
		await new Promise((resolve) => setTimeout(resolve, 0));
		const toggle = editor.view.dom.querySelector("button");
		expect(toggle).toBeInstanceOf(HTMLButtonElement);
		(toggle as HTMLButtonElement).click();

		expect(editor.getJSON().content?.[0]?.attrs?.open).toBe(false);
		expect(postprocessMarkdownFromEditor(editor.getMarkdown())).toContain("<details>");

		editor.destroy();
	});

	it("keeps content after a details block when it is toggled", () => {
		const editor = new Editor({
			extensions: createEditorExtensions({
				enableSlashCommand: false,
				enableWikiLinks: false,
				enableMarkdownLinkAutocomplete: false,
			}),
			content: preprocessMarkdownForEditor(
				"<details>\n<summary>Title</summary>\n\nBody text.\n\n</details>\n\nAfter paragraph.",
			),
			contentType: "markdown",
			element: document.createElement("div"),
		});

		editor.view.dom.querySelector("button")?.click();

		expect(postprocessMarkdownFromEditor(editor.getMarkdown())).toBe(
			"<details open>\n<summary>Title</summary>\n\nBody text.\n\n</details>\n\nAfter paragraph.",
		);

		editor.destroy();
	});
});
