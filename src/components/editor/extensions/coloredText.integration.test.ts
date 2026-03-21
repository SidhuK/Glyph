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

describe("ColoredText markdown integration", () => {
	it("round-trips colored spans through markdown parse and serialize", () => {
		const manager = createMarkdownManager();
		const input =
			'Hello <span data-glyph-color="blue" style="color: var(--glyph-inline-color-blue, #0c66e4)">world</span>';

		const json = manager.parse(preprocessMarkdownForEditor(input));
		const paragraph = json.content?.[0];
		const coloredText = paragraph?.content?.[1];

		expect(coloredText?.type).toBe("text");
		expect(coloredText?.text).toBe("world");
		expect(coloredText?.marks?.[0]?.type).toBe("coloredText");
		expect(coloredText?.marks?.[0]?.attrs?.color).toBe("blue");

		const output = postprocessMarkdownFromEditor(manager.serialize(json));
		expect(output).toBe(input);
	});

	it("preserves nested formatting inside colored text", () => {
		const manager = createMarkdownManager();
		const input =
			'Before <span data-glyph-color="red" style="color: var(--glyph-inline-color-red, #c9372c)">**alert**</span> after';

		const json = manager.parse(preprocessMarkdownForEditor(input));
		const output = postprocessMarkdownFromEditor(manager.serialize(json));

		expect(output).toBe(input);
	});

	it("ignores unsupported glyph color ids", () => {
		const manager = createMarkdownManager();
		const input =
			'Before <span data-glyph-color="magenta" style="color: magenta">text</span> after';

		const json = manager.parse(preprocessMarkdownForEditor(input));
		const paragraph = json.content?.[0];
		expect(paragraph?.content?.[1]?.marks).toBeUndefined();

		const output = postprocessMarkdownFromEditor(manager.serialize(json));
		expect(output).toBe("Before text after");
	});

	it("applies color as a stored mark for collapsed selections and can clear it", () => {
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

		editor.chain().focus().setTextColor("green").insertContent("done").run();
		expect(postprocessMarkdownFromEditor(editor.getMarkdown())).toBe(
			'<span data-glyph-color="green" style="color: var(--glyph-inline-color-green, #216e4e)">done</span>',
		);

		editor.commands.selectAll();
		editor.commands.toggleBold();
		editor.commands.unsetTextColor();

		expect(postprocessMarkdownFromEditor(editor.getMarkdown())).toBe(
			"**done**",
		);

		editor.destroy();
	});
});
