// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { createEditorExtensions } from "./index";

function createEditor(enableVimKeybindings = true) {
	const element = document.createElement("div");
	document.body.appendChild(element);
	const editor = new Editor({
		extensions: createEditorExtensions({
			enableMarkdownLinkAutocomplete: false,
			enableSlashCommand: false,
			enableVimKeybindings,
			enableWikiLinks: false,
		}),
		content: "hello world",
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

function press(editor: Editor, key: string) {
	const event = new KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key,
	});
	editor.view.dom.dispatchEvent(event);
	return event.defaultPrevented;
}

function vimMode(editor: Editor) {
	const storage = (editor.storage as unknown as Record<string, unknown>)
		.vimMode as { mode?: string } | undefined;
	return storage?.mode;
}

describe("Vim mode extension", () => {
	it("is not registered when Vim keybindings are disabled", () => {
		const harness = createEditor(false);

		try {
			expect(
				(harness.editor.storage as unknown as Record<string, unknown>).vimMode,
			).toBeUndefined();
		} finally {
			harness.destroy();
		}
	});

	it("starts in insert mode and toggles between Vim normal and insert modes", () => {
		const harness = createEditor();

		try {
			expect(vimMode(harness.editor)).toBe("insert");

			expect(press(harness.editor, "Escape")).toBe(true);
			expect(vimMode(harness.editor)).toBe("normal");

			expect(press(harness.editor, "i")).toBe(true);
			expect(vimMode(harness.editor)).toBe("insert");
		} finally {
			harness.destroy();
		}
	});

	it("moves the cursor with basic Vim motions in normal mode", () => {
		const harness = createEditor();

		try {
			harness.editor.commands.setTextSelection(8);

			press(harness.editor, "Escape");
			const afterEscape = harness.editor.state.selection.head;
			press(harness.editor, "h");
			expect(harness.editor.state.selection.head).toBeLessThan(afterEscape);

			press(harness.editor, "l");
			expect(harness.editor.state.selection.head).toBe(afterEscape);

			press(harness.editor, "b");
			expect(harness.editor.state.selection.head).toBe(1);

			press(harness.editor, "0");
			expect(harness.editor.state.selection.head).toBe(1);

			press(harness.editor, "$");
			expect(harness.editor.state.selection.head).toBe(12);
		} finally {
			harness.destroy();
		}
	});

	it("supports x and dd edits in normal mode", () => {
		const harness = createEditor();

		try {
			harness.editor.commands.setTextSelection(2);
			press(harness.editor, "Escape");
			press(harness.editor, "x");

			expect(harness.editor.getText()).toBe("ello world");

			press(harness.editor, "d");
			press(harness.editor, "d");

			expect(harness.editor.getText()).toBe("");
			expect(vimMode(harness.editor)).toBe("normal");
		} finally {
			harness.destroy();
		}
	});
});
