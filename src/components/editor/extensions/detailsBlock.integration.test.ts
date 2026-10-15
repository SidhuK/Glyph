// @vitest-environment jsdom

import { Editor, type JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vite-plus/test";
import {
	postprocessMarkdownFromEditor,
	preprocessMarkdownForEditor,
} from "../markdown/editorMarkdownBridge";
import { createDetailsBlockContent } from "../editorActions";
import { createEditorExtensions } from "./index";

const extensions = () =>
	createEditorExtensions({
		enableSlashCommand: false,
		enableWikiLinks: false,
		enableMarkdownLinkAutocomplete: false,
	});

function parse(input: string) {
	const manager = new MarkdownManager({
		extensions: extensions(),
		markedOptions: { gfm: true, breaks: false },
	});
	return { manager, json: manager.parse(preprocessMarkdownForEditor(input)) };
}

function roundTrip(input: string) {
	const { manager, json } = parse(input);
	return postprocessMarkdownFromEditor(manager.serialize(json));
}

function createEditor(content: string | JSONContent) {
	return new Editor({
		extensions: extensions(),
		content: typeof content === "string" ? preprocessMarkdownForEditor(content) : content,
		contentType: typeof content === "string" ? "markdown" : "json",
		element: document.createElement("div"),
	});
}

const details = (body: string, summary = "Title", open = "") =>
	`<details${open}>\n<summary>${summary}</summary>\n\n${body}\n\n</details>`;

describe("details markdown round-trip", () => {
	it.each([
		["an open block", details("Toggle content.", "Toggle title", " open")],
		["several paragraphs", details("First paragraph.\n\nSecond paragraph.")],
		["escaped summary text", details("Body.", "&lt;/summary&gt;&lt;script&gt;")],
		["content after the block", `${details("Body.")}\n\nAfter paragraph.\n\n## Heading after`],
		[
			"content between blocks",
			`Intro\n\n${details("A", "A", " open")}\n\nBetween.\n\n${details("B", "B")}\n\nTail.`,
		],
		["nested blocks", `${details(details("Nested body.", "Inner"), "Outer", " open")}\n\nAfter.`],
		["a bare ::: line", details("Body\n\n:::\n\nMore body")],
		["a backtick fence", `${details("```js\nconst a = 1;\n```")}\n\nAfter.`],
		["a longer fence", `${details("````md\n```\ninner\n```\n````")}\n\nAfter.`],
		["a fenced closing tag", `${details("```html\n</details>\n```")}\n\nAfter.`],
		["fenced ::: syntax", `${details("```md\n:::note\nText\n:::\n```")}\n\nAfter.`],
		["inline code tags", `Use \`<details>\` and \`</details>\`.\n\n${details("Body.")}`],
		[
			"a fenced details example",
			"```html\n<details>\n<summary>Example</summary>\nBody\n</details>\n```",
		],
	])("keeps %s", (_name, input) => {
		expect(roundTrip(input)).toBe(input);
	});

	it("writes tilde fences inside a block with backticks", () => {
		expect(roundTrip(details("~~~js\nconst a = 1;\n~~~"))).toBe(
			details("```js\nconst a = 1;\n```"),
		);
	});

	it("reads a code fence without blank lines around it", () => {
		const { json } = parse(
			"<details>\n<summary>Title</summary>\n```js\nconst a = 1;\n```\n</details>\nAfter.",
		);
		expect(json.content?.map((node) => node.type)).toEqual(["details", "paragraph"]);
		expect(json.content?.[0]?.content?.[1]?.content?.[0]?.type).toBe("codeBlock");
	});

	it("reads a block after a stray closing tag", () => {
		const { json } = parse(`</details>\n\n${details("Body.")}`);
		expect(json.content?.map((node) => node.type)).toEqual(["paragraph", "details"]);
	});

	it("keeps a summary that is not the first child", () => {
		const input = "<details>\n\nBody first.\n\n<summary>Late</summary>\n\nMore.\n\n</details>";
		expect(roundTrip(input)).toBe(details("Body first.\n\nMore.", "Late"));
	});

	it("keeps separate paragraphs in a block inside a list item", () => {
		const input = `- item one\n\n  ${details("Body line.\n\nMore body.").replace(/\n(?=.)/g, "\n  ")}\n\n- item two`;
		const { json } = parse(input);
		const content = json.content?.[0]?.content?.[0]?.content?.[1]?.content?.[1]?.content;
		expect(content?.map((node) => node.type)).toEqual(["paragraph", "paragraph"]);
	});

	it("reads :::detailsSummary and :::detailsContent as plain text", () => {
		const { json } = parse(":::detailsSummary\n\nT\n\n:::\n\n:::detailsContent\n\nBody\n\n:::");
		expect(new Set(json.content?.map((node) => node.type))).toEqual(new Set(["paragraph"]));
	});

	it("only treats a real open attribute as open", () => {
		const { json } = parse(details("Body.", "Title", ' class="a open b"'));
		expect(json.content?.[0]?.attrs?.open).toBe(false);
	});

	it("writes blank paragraphs the same way inside a block as outside it", () => {
		const paragraph = (text?: string): JSONContent =>
			text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
		const paragraphs = [paragraph("A"), paragraph(), paragraph(), paragraph("B")];
		const summary = { type: "detailsSummary", content: [{ type: "text", text: "Title" }] };
		const block = {
			type: "details",
			content: [summary, { type: "detailsContent", content: paragraphs }],
		};
		const outside = createEditor({ type: "doc", content: paragraphs });
		const inside = createEditor({ type: "doc", content: [block] });

		expect(postprocessMarkdownFromEditor(inside.getMarkdown())).toBe(
			details(outside.getMarkdown()),
		);
		outside.destroy();
		inside.destroy();
	});
});

describe("Details block editor integration", () => {
	it("inserts a details block via the details_block action content path", () => {
		const editor = createEditor("");

		expect(editor.chain().focus().insertContent(createDetailsBlockContent()).run()).toBe(true);
		const output = postprocessMarkdownFromEditor(editor.getMarkdown());
		expect(output).toContain("<details open>");
		expect(output).toContain("<summary>Toggle title</summary>");

		editor.destroy();
	});

	it("persists toggle changes for a details block at document start", () => {
		const editor = createEditor("");

		editor.chain().focus().insertContent(createDetailsBlockContent()).run();
		const toggle = editor.view.dom.querySelector("button");
		expect(toggle).toBeInstanceOf(HTMLButtonElement);
		toggle?.click();

		expect(editor.getJSON().content?.[0]?.attrs?.open).toBe(false);
		expect(postprocessMarkdownFromEditor(editor.getMarkdown())).toContain("<details>");

		editor.destroy();
	});

	it("keeps content after a details block when it is toggled", () => {
		const editor = createEditor(`${details("Body text.")}\n\nAfter paragraph.`);

		editor.view.dom.querySelector("button")?.click();

		expect(postprocessMarkdownFromEditor(editor.getMarkdown())).toBe(
			`${details("Body text.", "Title", " open")}\n\nAfter paragraph.`,
		);

		editor.destroy();
	});
});
