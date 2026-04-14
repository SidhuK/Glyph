// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { createEditorExtensions } from "./index";

function createEditor(enableVimKeybindings = true, content = "hello world") {
	const element = document.createElement("div");
	document.body.appendChild(element);
	const editor = new Editor({
		extensions: createEditorExtensions({
			enableMarkdownLinkAutocomplete: false,
			enableSlashCommand: false,
			enableVimKeybindings,
			enableWikiLinks: false,
		}),
		content,
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
	return vimStorage(editor)?.mode;
}

function vimStorage(editor: Editor) {
	return (editor.storage as unknown as Record<string, unknown>).vimMode as
		| { mode?: string; pendingExpiresAt?: number; pendingKey?: string | null }
		| undefined;
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
			expect(harness.editor.view.dom.getAttribute("data-vim-mode")).toBe(
				"insert",
			);

			expect(press(harness.editor, "Escape")).toBe(true);
			expect(vimMode(harness.editor)).toBe("normal");
			expect(harness.editor.view.dom.getAttribute("data-vim-mode")).toBe(
				"normal",
			);

			expect(press(harness.editor, "i")).toBe(true);
			expect(vimMode(harness.editor)).toBe("insert");
			expect(harness.editor.view.dom.getAttribute("data-vim-mode")).toBe(
				"insert",
			);
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
			expect(harness.editor.state.selection.head).toBe(11);
		} finally {
			harness.destroy();
		}
	});

	it("treats $ as an end-of-line motion so x deletes the last character", () => {
		const harness = createEditor();

		try {
			harness.editor.commands.setTextSelection(2);
			press(harness.editor, "Escape");
			press(harness.editor, "$");
			press(harness.editor, "x");

			expect(harness.editor.getText()).toBe("hello worl");
			expect(vimMode(harness.editor)).toBe("normal");
		} finally {
			harness.destroy();
		}
	});

	it("uses A as an append-at-end command", () => {
		const harness = createEditor();

		try {
			harness.editor.commands.setTextSelection(2);
			press(harness.editor, "Escape");
			press(harness.editor, "A");
			harness.editor.commands.insertContent("!");

			expect(harness.editor.getText()).toBe("hello world!");
			expect(vimMode(harness.editor)).toBe("insert");
		} finally {
			harness.destroy();
		}
	});

	it("clears pending operators on unrelated keydown", () => {
		const harness = createEditor();

		try {
			press(harness.editor, "Escape");
			press(harness.editor, "d");
			expect(vimStorage(harness.editor)?.pendingKey).toBe("d");

			press(harness.editor, "ArrowRight");
			expect(vimStorage(harness.editor)?.pendingKey).toBeNull();
			expect(vimStorage(harness.editor)?.pendingExpiresAt).toBe(0);

			press(harness.editor, "d");
			expect(harness.editor.getText()).toBe("hello world");
			expect(vimStorage(harness.editor)?.pendingKey).toBe("d");
		} finally {
			harness.destroy();
		}
	});

	it("clears pending operators on blur", () => {
		const harness = createEditor();

		try {
			press(harness.editor, "Escape");
			press(harness.editor, "g");
			expect(vimStorage(harness.editor)?.pendingKey).toBe("g");

			harness.editor.view.dom.dispatchEvent(
				new FocusEvent("blur", { bubbles: true }),
			);

			expect(vimStorage(harness.editor)?.pendingKey).toBeNull();
			expect(vimStorage(harness.editor)?.pendingExpiresAt).toBe(0);
		} finally {
			harness.destroy();
		}
	});

	it("clears pending operators on selection changes", () => {
		const harness = createEditor();

		try {
			press(harness.editor, "Escape");
			press(harness.editor, "d");
			expect(vimStorage(harness.editor)?.pendingKey).toBe("d");

			harness.editor.commands.setTextSelection(5);

			expect(vimStorage(harness.editor)?.pendingKey).toBeNull();
			expect(vimStorage(harness.editor)?.pendingExpiresAt).toBe(0);
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

	it("removes the whole paragraph with dd when another paragraph remains", () => {
		const harness = createEditor(true, "alpha\n\nbeta");

		try {
			harness.editor.commands.setTextSelection(3);
			press(harness.editor, "Escape");
			press(harness.editor, "d");
			press(harness.editor, "d");

			expect(harness.editor.getMarkdown()).toBe("beta");
			expect(vimMode(harness.editor)).toBe("normal");
		} finally {
			harness.destroy();
		}
	});

	it("keeps the required empty paragraph when dd deletes the only paragraph", () => {
		const harness = createEditor(true, "alpha");

		try {
			harness.editor.commands.setTextSelection(3);
			press(harness.editor, "Escape");
			press(harness.editor, "d");
			press(harness.editor, "d");

			expect(harness.editor.getText()).toBe("");
			expect(vimMode(harness.editor)).toBe("normal");
		} finally {
			harness.destroy();
		}
	});
});

describe("Vim mode line opening", () => {
	it("opens an empty line above and leaves the cursor there with O", () => {
		const harness = createEditor(true, "hello world");

		try {
			harness.editor.commands.setTextSelection(7);
			press(harness.editor, "Escape");
			press(harness.editor, "O");
			harness.editor.commands.insertContent("above");

			expect(harness.editor.getMarkdown()).toBe("above\n\nhello world");
			expect(vimMode(harness.editor)).toBe("insert");
		} finally {
			harness.destroy();
		}
	});

	it("opens an empty line below and leaves the cursor there with o", () => {
		const harness = createEditor(true, "hello world");

		try {
			harness.editor.commands.setTextSelection(7);
			press(harness.editor, "Escape");
			press(harness.editor, "o");
			harness.editor.commands.insertContent("below");

			expect(harness.editor.getMarkdown()).toBe("hello world\n\nbelow");
			expect(vimMode(harness.editor)).toBe("insert");
		} finally {
			harness.destroy();
		}
	});
});
