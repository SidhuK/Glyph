// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vite-plus/test";
import {
	postprocessMarkdownFromEditor,
	preprocessMarkdownForEditor,
} from "../markdown/editorMarkdownBridge";
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

describe("HighlightedText markdown integration", () => {
	it("reads yellow HTML highlights and writes them back as ==text==", () => {
		const manager = createMarkdownManager();
		const input =
			'Hello <mark data-glyph-highlight="yellow" style="background-color: var(--glyph-inline-highlight-yellow, rgba(240, 180, 41, 0.26))">world</mark>';

		const json = manager.parse(preprocessMarkdownForEditor(input));
		const paragraph = json.content?.[0];
		const highlightedText = paragraph?.content?.[1];

		expect(highlightedText?.type).toBe("text");
		expect(highlightedText?.text).toBe("world");
		expect(highlightedText?.marks?.[0]?.type).toBe("highlightedText");
		expect(highlightedText?.marks?.[0]?.attrs?.color).toBe("yellow");

		const output = postprocessMarkdownFromEditor(manager.serialize(json));
		expect(output).toBe("Hello ==world==");
	});

	it("round-trips ==text== as a yellow highlight with nested formatting", () => {
		const manager = createMarkdownManager();
		const input = "Use ==**focus** here== now";

		const json = manager.parse(preprocessMarkdownForEditor(input));
		const marks = json.content?.[0]?.content?.[1]?.marks ?? [];
		expect(marks.map((mark) => mark.type)).toContain("highlightedText");
		expect(marks.find((mark) => mark.type === "highlightedText")?.attrs?.color).toBe("yellow");

		const output = postprocessMarkdownFromEditor(manager.serialize(json));
		expect(output).toBe(input);
	});

	it("leaves == inside inline code untouched", () => {
		const manager = createMarkdownManager();
		const input = "Compare `a ==b== c` here";

		const json = manager.parse(preprocessMarkdownForEditor(input));
		const output = postprocessMarkdownFromEditor(manager.serialize(json));
		expect(output).toBe(input);
	});

	it("does not treat space-padded == as a highlight", () => {
		const manager = createMarkdownManager();
		for (const input of ["a == b == c", "Prefer === over ==, since == coerces"]) {
			const json = manager.parse(preprocessMarkdownForEditor(input));
			expect(json.content?.[0]?.content?.some((node) => node.marks?.length)).toBeFalsy();
			expect(postprocessMarkdownFromEditor(manager.serialize(json))).toBe(input);
		}
	});

	it("keeps the HTML form for yellow highlights that contain =", () => {
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

		editor.chain().focus().setTextHighlight("yellow").insertContent("a=b").run();
		expect(postprocessMarkdownFromEditor(editor.getMarkdown())).toBe(
			'<mark data-glyph-highlight="yellow" style="background-color: var(--glyph-inline-highlight-yellow, rgba(240, 180, 41, 0.26))">a=b</mark>',
		);

		editor.destroy();
	});

	it.each([
		["note ==done=", "note ==done==", 1],
		["(==note=", "(==note==", 1],
		["x == y =", "x == y ==", null],
	])("typing the closing = after %s", (content, expected, highlightedIndex) => {
		const editor = new Editor({
			extensions: createEditorExtensions({
				enableSlashCommand: false,
				enableWikiLinks: false,
				enableMarkdownLinkAutocomplete: false,
			}),
			content,
			contentType: "markdown",
			element: document.createElement("div"),
		});

		editor.commands.focus("end");
		const { from, to } = editor.state.selection;
		const insertClosing = () => editor.state.tr.insertText("=", from, to);
		const handled = editor.view.someProp("handleTextInput", (handler) =>
			handler(editor.view, from, to, "=", insertClosing),
		);
		if (!handled) editor.view.dispatch(insertClosing());

		const nodes = editor.getJSON().content?.[0]?.content ?? [];
		expect(postprocessMarkdownFromEditor(editor.getMarkdown())).toBe(expected);
		if (highlightedIndex === null) {
			expect(nodes.some((node) => node.marks?.length)).toBe(false);
		} else {
			expect(nodes[highlightedIndex]?.marks?.[0]?.attrs?.color).toBe("yellow");
		}

		editor.destroy();
	});

	it("supports nested text color inside a highlighted mark", () => {
		const manager = createMarkdownManager();
		const input =
			'Before <mark data-glyph-highlight="blue" style="background-color: var(--glyph-inline-highlight-blue, rgba(59, 155, 220, 0.22))"><span data-glyph-color="red" style="color: var(--glyph-inline-color-red)">alert</span></mark> after';

		const json = manager.parse(preprocessMarkdownForEditor(input));
		const output = postprocessMarkdownFromEditor(manager.serialize(json));

		expect(output).toBe(input);
	});

	it("ignores unsupported glyph highlight ids", () => {
		const manager = createMarkdownManager();
		const input =
			'Before <mark data-glyph-highlight="pink" style="background-color: pink">text</mark> after';

		const json = manager.parse(preprocessMarkdownForEditor(input));
		const paragraph = json.content?.[0];
		expect(paragraph?.content?.[1]?.marks).toBeUndefined();

		const output = postprocessMarkdownFromEditor(manager.serialize(json));
		expect(output).toBe("Before text after");
	});

	it("applies highlight as a stored mark for collapsed selections and can clear it", () => {
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

		editor.chain().focus().setTextHighlight("green").insertContent("done").run();
		expect(postprocessMarkdownFromEditor(editor.getMarkdown())).toBe(
			'<mark data-glyph-highlight="green" style="background-color: var(--glyph-inline-highlight-green, rgba(60, 207, 142, 0.24))">done</mark>',
		);

		editor.commands.selectAll();
		editor.commands.toggleBold();
		editor.commands.unsetTextHighlight();

		expect(postprocessMarkdownFromEditor(editor.getMarkdown())).toBe("**done**");

		editor.destroy();
	});

	it("replaces an existing highlight instead of nesting a second one", () => {
		const editor = new Editor({
			extensions: createEditorExtensions({
				enableSlashCommand: false,
				enableWikiLinks: false,
				enableMarkdownLinkAutocomplete: false,
			}),
			content:
				'<mark data-glyph-highlight="yellow" style="background-color: var(--glyph-inline-highlight-yellow, rgba(240, 180, 41, 0.26))">done</mark>',
			contentType: "markdown",
			element: document.createElement("div"),
		});

		editor.commands.selectAll();
		editor.chain().focus().setTextHighlight("red").run();

		expect(postprocessMarkdownFromEditor(editor.getMarkdown())).toBe(
			'<mark data-glyph-highlight="red" style="background-color: var(--glyph-inline-highlight-red, rgba(249, 112, 102, 0.2))">done</mark>',
		);

		editor.destroy();
	});
});
