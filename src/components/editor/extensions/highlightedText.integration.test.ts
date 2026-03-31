// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
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

describe("HighlightedText markdown integration", () => {
	it("round-trips highlighted marks through markdown parse and serialize", () => {
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
		expect(output).toBe(input);
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

		editor
			.chain()
			.focus()
			.setTextHighlight("green")
			.insertContent("done")
			.run();
		expect(postprocessMarkdownFromEditor(editor.getMarkdown())).toBe(
			'<mark data-glyph-highlight="green" style="background-color: var(--glyph-inline-highlight-green, rgba(60, 207, 142, 0.24))">done</mark>',
		);

		editor.commands.selectAll();
		editor.commands.toggleBold();
		editor.commands.unsetTextHighlight();

		expect(postprocessMarkdownFromEditor(editor.getMarkdown())).toBe(
			"**done**",
		);

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
